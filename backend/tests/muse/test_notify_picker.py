"""M3: notify picker agent: cap, hard rules, forced picks, fallback."""

import pytest

from app.domain.affinity import Features
from app.muse.agents import notify_picker
from app.muse.agents.notify_picker import NotifyRequest, cap_for, pick
from app.muse.client import FakeMuseClient
from app.muse.context import Candidate
from app.muse.runner import MuseRunner
from tests.muse.factories import T0
from tests.muse.fakes import FixedClock

pytestmark = pytest.mark.anyio


def cand(uid, aff, *, h90=3, verified=True, now="unknown") -> Candidate:
    feats = Features(hangouts_30d=min(h90, 2), hangouts_90d=h90, currently=now)
    return Candidate(uid, uid.title(), verified, feats, aff)


CANDS = [
    cand("maya", 9.0),
    cand("priya", 7.0),
    cand("dev", 6.0, now="busy"),
    cand("sam", 1.0, h90=0),  # stretch, verified
    cand("kai", 0.5, h90=0, verified=False),  # stretch, unverified
    cand("riley", 0.4, h90=0),  # stretch, verified
]


def request(**kw) -> NotifyRequest:
    base = dict(
        creator_id="tony",
        creator_first="Tony",
        text="getting matcha",
        category="coffee",
        mark_name="Kumo",
        when=T0,
        candidates=CANDS,
        audience_size=8,
        there=[("tony", "Tony"), ("anish", "Anish")],
    )
    return NotifyRequest(**{**base, **kw})


def runner(answer) -> tuple[MuseRunner, FakeMuseClient]:
    client = FakeMuseClient({"notify_picker": answer})
    return MuseRunner(client, clock=lambda: FixedClock(T0)), client


def alias_answer(*picks, force=()):
    """Muse output that refers to candidates by their render order (u3..)."""

    def answer(system, prompt):
        rows = prompt.split("Candidates:\n", 1)[1].splitlines()[1:]
        order = [c for c in CANDS if c.user_id in force]
        order += [c for c in CANDS if c.user_id not in force]
        aliases = {}
        for row, c in zip(rows, order, strict=False):
            aliases[c.user_id] = row.split("|", 1)[0]
        return {
            "picks": [
                {
                    "user": aliases[u],
                    "copy": f"Hey {{{aliases[u]}}}, {{u1}}'s at Kumo",
                    "reason": "matcha regular",
                }
                for u in picks
            ],
            "skipped_note": "left out {u3}",
        }

    return answer


@pytest.mark.parametrize(("audience", "cap"), [(0, 0), (1, 1), (5, 3), (8, 4), (40, 8)])
def test_cap_math(audience, cap) -> None:
    assert cap_for(audience) == cap


async def test_valid_output_parses_and_restores_names() -> None:
    r, _ = runner(alias_answer("maya", "priya"))
    result = await pick(r, request())
    assert [p.user_id for p in result.picks] == ["maya", "priya"]
    assert result.picks[0].copy == "Hey Maya, Tony's at Kumo"
    assert result.picks[0].reason == "matcha regular"
    assert "{u" not in result.skipped_note


async def test_busy_unverified_stretch_and_second_stretch_are_removed() -> None:
    r, _ = runner(alias_answer("dev", "kai", "sam", "riley", "maya"))
    result = await pick(r, request())
    assert [p.user_id for p in result.picks] == ["sam", "maya"]


async def test_cap_is_enforced_and_forced_adds_go_on_top() -> None:
    r, _ = runner(alias_answer("maya", "priya", "sam", force={"dev"}))
    result = await pick(r, request(audience_size=3, force_ids=frozenset({"dev"})))
    ids = [p.user_id for p in result.picks]
    assert ids == ["maya", "priya", "dev"]  # cap 2, then the forced (busy) pick
    assert result.picks[-1].copy.startswith("Hey Dev")


async def test_dropped_ids_never_picked() -> None:
    r, _ = runner(alias_answer("maya", "priya"))
    result = await pick(r, request(drop_ids=frozenset({"maya"})))
    assert [p.user_id for p in result.picks] == ["priya"]


async def test_copy_without_hey_first_name_gets_template() -> None:
    def answer(system, prompt):
        return {"picks": [{"user": "u3", "copy": "yo come thru", "reason": ""}]}

    r, _ = runner(answer)
    [p] = (await pick(r, request())).picks
    assert (
        p.copy
        == 'Hey Maya, Tony posted "getting matcha" at Kumo. Anish\'s already there.'
    )


async def test_garbage_output_triggers_fallback() -> None:
    r, client = runner("I think Maya would love this!")
    result = await pick(r, request(force_ids=frozenset({"riley"})))
    assert len(client.calls) == 2
    # top N by affinity, never busy, unverified stretch skipped; cap 4 + forced
    assert [p.user_id for p in result.picks] == ["maya", "priya", "sam", "riley"]
    assert all(p.copy.startswith(f"Hey {p.user_id.title()},") for p in result.picks)


async def test_all_invalid_aliases_is_rejected_then_falls_back() -> None:
    r, client = runner({"picks": [{"user": "u99", "copy": "Hey x", "reason": ""}]})
    result = await pick(r, request())
    assert len(client.calls) == 2
    assert result.picks[0].user_id == "maya"


async def test_no_candidates_means_no_call() -> None:
    r, client = runner({"picks": []})
    assert (await pick(r, request(candidates=[]))).picks == []
    assert client.calls == []


def test_prompt_file_exists() -> None:
    from app.muse.runner import load_prompt

    assert load_prompt(notify_picker.AGENT).startswith("[notify_picker] You are Muse")
