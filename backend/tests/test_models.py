"""Tests for Pydantic message models.

All WebSocket message schemas must be validated here.
See SRS.md §4 for the canonical message protocol.
"""
import pytest
from pydantic import ValidationError


def test_create_room_message_no_password():
    from models import CreateRoomMessage
    msg = CreateRoomMessage(type="create-room")
    assert msg.type == "create-room"
    assert msg.password is None


def test_create_room_message_with_password():
    from models import CreateRoomMessage
    msg = CreateRoomMessage(type="create-room", password="secret")
    assert msg.password == "secret"


def test_join_room_message_requires_code():
    from models import JoinRoomMessage
    with pytest.raises(ValidationError):
        JoinRoomMessage(type="join-room")  # missing code


def test_join_room_message_normalizes_code_to_uppercase():
    from models import JoinRoomMessage
    msg = JoinRoomMessage(type="join-room", code="x7k2p9")
    assert msg.code == "X7K2P9"


def test_signal_message_requires_payload():
    from models import SignalMessage
    with pytest.raises(ValidationError):
        SignalMessage(type="signal")  # missing payload


def test_room_created_response_has_required_fields():
    from models import RoomCreatedResponse
    msg = RoomCreatedResponse(
        type="room-created",
        room_id="test-uuid",
        code="X7K2P9",
        url="https://example.com/join/X7K2P9"
    )
    assert msg.room_id == "test-uuid"
    assert msg.code == "X7K2P9"


def test_error_response_has_code_and_message():
    from models import ErrorResponse
    msg = ErrorResponse(
        type="error",
        code="ROOM_NOT_FOUND",
        message="Room not found or expired"
    )
    assert msg.code == "ROOM_NOT_FOUND"


def test_verify_password_message():
    from models import VerifyPasswordMessage
    msg = VerifyPasswordMessage(type="verify-password", password="secret")
    assert msg.password == "secret"
