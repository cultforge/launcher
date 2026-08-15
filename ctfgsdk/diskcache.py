from typing import Any, Optional

import msgpack
from cryptography.fernet import Fernet
from sqlmodel import Field, Session, SQLModel, create_engine, select


class CacheItem(SQLModel, table=True):
    """The SQLite table for our Key-Value store."""

    key: str = Field(primary_key=True, description="The plaintext lookup key")
    encrypted_value: bytes = Field(
        description="Msgpack serialized and AES encrypted payload"
    )


class DiskCache:
    def __init__(self, db_path: str, encryption_key: bytes):
        """
        Initializes the SQLite database and the encryption engine.

        :param db_path: Path to the sqlite file (e.g., 'sqlite:///my_cache.db')
        :param encryption_key: A url-safe base64-encoded 32-byte key (generate via Fernet.generate_key())
        """
        self.engine = create_engine(db_path, echo=False)
        self.cipher = Fernet(encryption_key)

        SQLModel.metadata.create_all(self.engine)

    def set(self, key: str, value: Any) -> None:
        """Serializes, encrypts, and stores the value."""
        packed_bytes = msgpack.packb(value, use_bin_type=True)

        encrypted_bytes = self.cipher.encrypt(packed_bytes)

        with Session(self.engine) as session:
            existing_item = session.get(CacheItem, key)
            if existing_item:
                existing_item.encrypted_value = encrypted_bytes
            else:
                new_item = CacheItem(key=key, encrypted_value=encrypted_bytes)
                session.add(new_item)

            session.commit()

    def get(self, key: str) -> Optional[Any]:
        """Retrieves, decrypts, and deserializes the value."""
        with Session(self.engine) as session:
            item = session.get(CacheItem, key)

            if not item:
                return None

            try:
                decrypted_bytes = self.cipher.decrypt(item.encrypted_value)
                return msgpack.unpackb(decrypted_bytes, raw=False)
            except Exception as e:
                print(f"Failed to decrypt or unpack key '{key}': {e}")
                return None

    def delete(self, key: str) -> bool:
        """Deletes a key from the database."""
        with Session(self.engine) as session:
            item = session.get(CacheItem, key)
            if item:
                session.delete(item)
                session.commit()
                return True
            return False
