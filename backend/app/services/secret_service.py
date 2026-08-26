import base64
import ctypes
import sys
from ctypes import wintypes


DPAPI_PREFIX = "dpapi:"


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def protect_secret(value: str | None) -> str | None:
    if not value or value.startswith(DPAPI_PREFIX):
        return value
    if sys.platform != "win32":
        raise RuntimeError("secret_encryption_unavailable")
    encrypted = _crypt_protect(value.encode("utf-8"))
    return f"{DPAPI_PREFIX}{base64.b64encode(encrypted).decode('ascii')}"


def unprotect_secret(value: str | None) -> str | None:
    if not value:
        return value
    if not value.startswith(DPAPI_PREFIX):
        return value
    if sys.platform != "win32":
        raise RuntimeError("secret_decryption_unavailable")
    raw = base64.b64decode(value.removeprefix(DPAPI_PREFIX))
    return _crypt_unprotect(raw).decode("utf-8")


def is_protected_secret(value: str | None) -> bool:
    return bool(value and value.startswith(DPAPI_PREFIX))


def _crypt_protect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_blob = _to_blob(data)
    out_blob = DATA_BLOB()
    if not crypt32.CryptProtectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise RuntimeError("secret_encryption_failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _crypt_unprotect(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_blob = _to_blob(data)
    out_blob = DATA_BLOB()
    if not crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise RuntimeError("secret_decryption_failed")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _to_blob(data: bytes) -> DATA_BLOB:
    buffer = ctypes.create_string_buffer(data)
    return DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
