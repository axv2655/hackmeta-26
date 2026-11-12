import pytest

from app.domain import invites as rules
from app.domain.invites import InvalidInvite


def test_invite_text_matches_the_pitch() -> None:
    assert (
        rules.invite_text("Anish", "McDermott Library")
        == "Anish is making a move to McDermott Library. You want to pull up?"
    )


def test_invite_text_names_the_creator_when_someone_else_shares() -> None:
    assert (
        rules.invite_text("Anish", "Kumo Matcha", "Tony")
        == "Anish: Tony is making a move to Kumo Matcha. You want to pull up?"
    )
    assert rules.invite_text("Tony", "Kumo Matcha", "Tony").startswith("Tony is")


def test_share_body_ends_with_the_link_so_imessage_splits_it() -> None:
    body = rules.share_body("Pull up?", "https://x.test/m/abc")
    assert body == "Pull up?\nhttps://x.test/m/abc"


def test_clean_message() -> None:
    assert rules.clean_message("  hey   you  ", "fallback") == "hey you"
    assert rules.clean_message(None, "fallback") == "fallback"
    with pytest.raises(InvalidInvite):
        rules.clean_message("x" * (rules.MAX_MESSAGE_CHARS + 1), "fallback")


def test_clean_name() -> None:
    assert rules.clean_name("  Sam   Lee ") == "Sam Lee"
    assert rules.clean_name(None) == ""
    assert len(rules.clean_name("x" * 100)) == rules.MAX_NAME_CHARS


def test_tokens_are_unique_and_url_safe() -> None:
    tokens = {rules.new_token() for _ in range(200)}
    assert len(tokens) == 200
    assert all(len(t) == 12 and "/" not in t and "+" not in t for t in tokens)


def test_invite_cap() -> None:
    rules.check_invite_count(rules.MAX_INVITES_PER_MOVE - 1)
    with pytest.raises(InvalidInvite):
        rules.check_invite_count(rules.MAX_INVITES_PER_MOVE)
