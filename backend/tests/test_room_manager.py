"""Unit tests for RoomManager.

All room state logic must be tested here before implementation.
See SRS.md §2.1 for room management functional requirements.
"""
import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime, timedelta


@pytest.fixture(autouse=True)
def reset_rooms():
    """Ensure clean state between tests."""
    from room_manager import room_manager
    room_manager.rooms.clear()
    yield
    room_manager.rooms.clear()


# ── Code generation ──────────────────────────────────────────

def test_generate_code_returns_6_characters():
    from room_manager import room_manager
    code = room_manager.generate_code()
    assert len(code) == 6


def test_generate_code_is_uppercase_alphanumeric():
    from room_manager import room_manager
    code = room_manager.generate_code()
    assert code.isalnum()
    assert code == code.upper()


def test_generate_code_produces_unique_values():
    from room_manager import room_manager
    codes = {room_manager.generate_code() for _ in range(100)}
    # 100 codes should almost certainly be unique (collision space is huge)
    assert len(codes) > 90


# ── Room creation ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_room_returns_room_object():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.room_id is not None
    assert room.code is not None
    assert len(room.code) == 6


@pytest.mark.asyncio
async def test_create_room_stores_in_rooms_dict():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.room_id in room_manager.rooms


@pytest.mark.asyncio
async def test_create_room_with_password_hashes_it():
    from room_manager import room_manager
    import bcrypt
    room = await room_manager.create_room(password="secret")
    # The stored hash must NOT be the plaintext password
    assert room.password_hash is not None
    assert room.password_hash != "secret"
    # But it must verify correctly
    assert bcrypt.checkpw(b"secret", room.password_hash.encode())


@pytest.mark.asyncio
async def test_create_room_no_password_stores_none():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert room.password_hash is None


# ── Room lookup ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_room_by_code_returns_correct_room():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    found = room_manager.get_room_by_code(room.code)
    assert found is not None
    assert found.room_id == room.room_id


@pytest.mark.asyncio
async def test_get_room_by_code_returns_none_for_missing():
    from room_manager import room_manager
    result = room_manager.get_room_by_code("ZZZZZZ")
    assert result is None


@pytest.mark.asyncio
async def test_get_room_by_code_is_case_insensitive():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    found = room_manager.get_room_by_code(room.code.lower())
    assert found is not None


# ── Peer management ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_room_starts_with_no_peers():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    assert len(room.peers) == 0


@pytest.mark.asyncio
async def test_add_peer_increments_count():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    mock_ws = AsyncMock()
    room_manager.add_peer(room.room_id, "peer-1", mock_ws)
    assert len(room.peers) == 1


@pytest.mark.asyncio
async def test_room_is_full_with_two_peers():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    room_manager.add_peer(room.room_id, "peer-1", AsyncMock())
    room_manager.add_peer(room.room_id, "peer-2", AsyncMock())
    assert room_manager.is_room_full(room.room_id) is True


@pytest.mark.asyncio
async def test_remove_peer_decrements_count():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    room_manager.add_peer(room.room_id, "peer-1", AsyncMock())
    room_manager.remove_peer(room.room_id, "peer-1")
    assert len(room.peers) == 0


# ── Room expiry ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_expired_room_is_removed():
    from room_manager import room_manager, Room
    from datetime import datetime, timedelta

    room = await room_manager.create_room(password=None)
    # Backdate the creation time
    room.created_at = datetime.utcnow() - timedelta(minutes=31)
    await room_manager.cleanup_expired_rooms()
    assert room.room_id not in room_manager.rooms


@pytest.mark.asyncio
async def test_active_room_is_not_removed():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    await room_manager.cleanup_expired_rooms()
    assert room.room_id in room_manager.rooms


# ── Password verification ────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_correct_password_returns_true():
    from room_manager import room_manager
    room = await room_manager.create_room(password="correcthorsebattery")
    result = room_manager.verify_password(room.room_id, "correcthorsebattery")
    assert result is True


@pytest.mark.asyncio
async def test_verify_wrong_password_returns_false():
    from room_manager import room_manager
    room = await room_manager.create_room(password="correcthorsebattery")
    result = room_manager.verify_password(room.room_id, "wrongpassword")
    assert result is False


@pytest.mark.asyncio
async def test_verify_password_on_no_password_room_returns_true():
    from room_manager import room_manager
    room = await room_manager.create_room(password=None)
    # Rooms without password are always accessible
    result = room_manager.verify_password(room.room_id, None)
    assert result is True
