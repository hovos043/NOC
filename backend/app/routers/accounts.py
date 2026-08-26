from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.account import Account
from app.models.account_note import AccountNote
from app.models.server import Server
from app.schemas import AccountListResponse, AccountNoteCreate, AccountNoteRead, AccountRead, AccountSearchResult, AccountServerOption, AccountServerOverview, WhmActionResult
from app.services.whm_service import WhmServiceError, suspend_account, sync_all_accounts, unsuspend_account

router = APIRouter(prefix="/accounts", tags=["accounts"])


SORT_COLUMNS = {
    "domain": Account.domain,
    "username": Account.username,
    "ip_address": Account.ip_address,
    "package": Account.package,
    "created_at": Account.created_at,
    "suspended": Account.suspended,
}


def account_to_read(account: Account) -> AccountRead:
    server = account.server
    return AccountRead(
        id=account.id,
        server_id=account.server_id,
        server_hostname=server.hostname,
        server_display_name=server.display_name,
        server_whm_hostname=server.whm_hostname,
        server_whm_port=server.whm_port,
        domain=account.domain,
        username=account.username,
        owner=account.owner,
        package=account.package,
        ip_address=account.ip_address,
        disk_usage=account.disk_usage,
        disk_limit=account.disk_limit,
        bandwidth_usage=account.bandwidth_usage,
        bandwidth_limit=account.bandwidth_limit,
        suspended=account.suspended,
        suspension_reason=account.suspension_reason,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


@router.get("", response_model=AccountListResponse)
def list_accounts(
    search: str | None = None,
    server_id: int | None = None,
    package: str | None = None,
    status_filter: str = Query(default="all", alias="status", pattern="^(all|active|suspended)$"),
    sort_by: str = Query(default="domain"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=250),
    db: Session = Depends(get_db),
) -> AccountListResponse:
    query = db.query(Account).options(joinedload(Account.server))
    if server_id:
        query = query.filter(Account.server_id == server_id)
    if package:
        query = query.filter(Account.package == package)
    if status_filter == "active":
        query = query.filter(Account.suspended.is_(False))
    elif status_filter == "suspended":
        query = query.filter(Account.suspended.is_(True))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Account.domain.ilike(term),
                Account.username.ilike(term),
                Account.owner.ilike(term),
                Account.ip_address.ilike(term),
                Account.package.ilike(term),
            )
        )

    total = query.count()
    sort_column = SORT_COLUMNS.get(sort_by, Account.domain)
    if sort_dir == "desc":
        sort_column = sort_column.desc()
    query = query.order_by(sort_column, Account.domain.asc())
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    total_accounts = db.query(func.count(Account.id)).scalar() or 0
    suspended_accounts = db.query(func.count(Account.id)).filter(Account.suspended.is_(True)).scalar() or 0
    active_accounts = total_accounts - suspended_accounts
    servers_count = db.query(func.count(distinct(Account.server_id))).scalar() or 0
    server_options = (
        db.query(Server.id, Server.hostname)
        .join(Account, Account.server_id == Server.id)
        .group_by(Server.id, Server.hostname)
        .order_by(Server.hostname.asc())
        .all()
    )
    package_options = [
        row[0]
        for row in db.query(Account.package)
        .filter(Account.package.is_not(None), Account.package != "")
        .distinct()
        .order_by(Account.package.asc())
        .all()
    ]
    overview = None
    if server_id:
        server = db.get(Server, server_id)
        if server:
            server_total = db.query(func.count(Account.id)).filter(Account.server_id == server_id).scalar() or 0
            server_suspended = (
                db.query(func.count(Account.id)).filter(Account.server_id == server_id, Account.suspended.is_(True)).scalar() or 0
            )
            overview = AccountServerOverview(
                server_id=server.id,
                server_name=server.hostname,
                accounts_count=server_total,
                active_accounts=server_total - server_suspended,
                suspended_accounts=server_suspended,
                last_sync_time=server.last_account_sync_at,
            )

    return AccountListResponse(
        items=[account_to_read(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_accounts=total_accounts,
        active_accounts=active_accounts,
        suspended_accounts=suspended_accounts,
        servers_count=servers_count,
        servers=[AccountServerOption(id=server.id, hostname=server.hostname) for server in server_options],
        packages=package_options,
        server_overview=overview,
    )


@router.get("/search", response_model=list[AccountSearchResult])
def search_accounts(q: str = Query(min_length=1), db: Session = Depends(get_db)) -> list[AccountSearchResult]:
    term = f"%{q.strip()}%"
    accounts = (
        db.query(Account)
        .options(joinedload(Account.server))
        .filter(or_(Account.domain.ilike(term), Account.username.ilike(term), Account.owner.ilike(term), Account.ip_address.ilike(term), Account.package.ilike(term)))
        .order_by(Account.domain.asc())
        .limit(50)
        .all()
    )
    return [
        AccountSearchResult(
            id=account.id,
            server=account.server.hostname,
            username=account.username,
            domain=account.domain,
            package=account.package,
            status="suspended" if account.suspended else "active",
        )
        for account in accounts
    ]


@router.post("/sync", response_model=WhmActionResult)
def sync_accounts(db: Session = Depends(get_db)) -> WhmActionResult:
    synced_count, errors = sync_all_accounts(db)
    if errors:
        return WhmActionResult(success=False, status="failed", synced_count=synced_count, error_message="partial_sync_failed", errors=errors)
    return WhmActionResult(success=True, status="connected", synced_count=synced_count, message="accounts_synced")


@router.get("/{account_id}", response_model=AccountRead)
def get_account(account_id: int, db: Session = Depends(get_db)) -> AccountRead:
    account = db.query(Account).options(joinedload(Account.server)).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    return account_to_read(account)


@router.get("/{account_id}/notes", response_model=list[AccountNoteRead])
def list_account_notes(account_id: int, db: Session = Depends(get_db)) -> list[AccountNoteRead]:
    if not db.get(Account, account_id):
        raise HTTPException(status_code=404, detail="account_not_found")
    return db.query(AccountNote).filter(AccountNote.account_id == account_id).order_by(AccountNote.created_at.desc(), AccountNote.id.desc()).all()


@router.post("/{account_id}/notes", response_model=AccountNoteRead, status_code=status.HTTP_201_CREATED)
def create_account_note(account_id: int, note_in: AccountNoteCreate, db: Session = Depends(get_db)) -> AccountNoteRead:
    if not db.get(Account, account_id):
        raise HTTPException(status_code=404, detail="account_not_found")
    note = AccountNote(account_id=account_id, note=note_in.note.strip())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{account_id}/notes", status_code=status.HTTP_204_NO_CONTENT)
def clear_account_notes(account_id: int, db: Session = Depends(get_db)) -> None:
    if not db.get(Account, account_id):
        raise HTTPException(status_code=404, detail="account_not_found")
    db.query(AccountNote).filter(AccountNote.account_id == account_id).delete(synchronize_session=False)
    db.commit()


@router.post("/{account_id}/suspend", response_model=WhmActionResult)
def suspend(account_id: int, db: Session = Depends(get_db)) -> WhmActionResult:
    try:
        suspend_account(db, account_id)
    except WhmServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc
    return WhmActionResult(success=True, status="connected", message="account_suspended")


@router.post("/{account_id}/unsuspend", response_model=WhmActionResult)
def unsuspend(account_id: int, db: Session = Depends(get_db)) -> WhmActionResult:
    try:
        unsuspend_account(db, account_id)
    except WhmServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code) from exc
    return WhmActionResult(success=True, status="connected", message="account_unsuspended")
