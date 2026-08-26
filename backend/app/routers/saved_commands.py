from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.saved_command import SavedCommand
from app.schemas import SavedCommandCreate, SavedCommandRead, SavedCommandUpdate

router = APIRouter(prefix="/saved-commands", tags=["saved-commands"])


@router.get("", response_model=list[SavedCommandRead])
def list_saved_commands(db: Session = Depends(get_db)) -> list[SavedCommandRead]:
    return db.query(SavedCommand).order_by(SavedCommand.category.asc(), SavedCommand.title.asc()).all()


@router.post("", response_model=SavedCommandRead, status_code=status.HTTP_201_CREATED)
def create_saved_command(payload: SavedCommandCreate, db: Session = Depends(get_db)) -> SavedCommandRead:
    command = SavedCommand(**payload.model_dump())
    db.add(command)
    db.commit()
    db.refresh(command)
    return command


@router.put("/{command_id}", response_model=SavedCommandRead)
def update_saved_command(command_id: int, payload: SavedCommandUpdate, db: Session = Depends(get_db)) -> SavedCommandRead:
    command = db.get(SavedCommand, command_id)
    if not command:
        raise HTTPException(status_code=404, detail="saved_command_not_found")
    for key, value in payload.model_dump().items():
        setattr(command, key, value)
    db.commit()
    db.refresh(command)
    return command


@router.delete("/{command_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_command(command_id: int, db: Session = Depends(get_db)) -> None:
    command = db.get(SavedCommand, command_id)
    if not command:
        raise HTTPException(status_code=404, detail="saved_command_not_found")
    db.delete(command)
    db.commit()
