#!/usr/bin/env python3
"""kr-guardrail-check Part 5 기계 검증 — 결정적 스크립트.

LLM의 눈대중 계산을 믿지 않고 다음을 재검증한다:
  5.1 파일명 패턴 린트 (outputs/ 각 레인)
  5.2 계약 필드 존재 (VISUAL DIRECTION / BLOTATO FLAG / Sponsored / Char count)
  5.3 글자수 재계산 — X는 CJK 2유닛·URL 23유닛 가중, Threads는 500자

사용:
  python3 verify_contracts.py --workroot <dir>   # <dir>/outputs/ 를 스캔
  python3 verify_contracts.py --workroot <dir> --json
종료 코드: 0 = BLOCK 없음, 1 = BLOCK 있음, 2 = 사용법 오류.

주의: 이 스크립트는 5.1의 '기대 레인 파일 누락'(workflow-status 기준)은 판단하지
않는다 — 존재하는 파일만 린트한다. 누락 판정은 리뷰어(LLM)가 workflow-status를
읽고 수행한다. 표시광고법·권리 등 의미 판단(Part 1~4)도 이 스크립트 범위 밖이다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
)

# 레인별 파일명 계약 (kr-guardrail-check SKILL.md Part 5.1)
LANE_PATTERNS = {
    "captions": re.compile(rf"^[a-z0-9-]+-captions-({MONTHS})-\d{{4}}\.md$"),
    "linkedin": re.compile(rf"^[a-z0-9-]+-linkedin-({MONTHS})-\d{{4}}\.md$"),
    "threads": re.compile(rf"^[a-z0-9-]+-threads-({MONTHS})-\d{{4}}\.md$"),
    "x": re.compile(rf"^[a-z0-9-]+-x-({MONTHS})-\d{{4}}\.md$"),
    "naver": re.compile(rf"^[a-z0-9-]+-naver-({MONTHS})-\d{{4}}\.md$"),
    "videos": re.compile(rf"^[a-z0-9-]+-reels-({MONTHS})-\d{{4}}\.md$"),
    "storyboards": re.compile(
        rf"^[a-z0-9-]+-storyboard-[a-z0-9-]+-({MONTHS})-\d{{4}}\.(md|json)$"
    ),
}

# X 가중 2유닛 범위 — X(Twitter) weighted-length 설정의 CJK·와이드 문자 범위 근사
WIDE_RANGES = (
    (0x1100, 0x115F), (0x2E80, 0x303E), (0x3041, 0x33FF), (0x3400, 0x4DBF),
    (0x4E00, 0x9FFF), (0xA000, 0xA4CF), (0xA960, 0xA97F), (0xAC00, 0xD7A3),
    (0xD7B0, 0xD7FF), (0xF900, 0xFAFF), (0xFE30, 0xFE4F), (0xFF00, 0xFF60),
    (0xFFE0, 0xFFE6),
)
URL_RE = re.compile(r"https?://\S+")
X_URL_UNITS = 23

BLOTATO_ALLOWED = re.compile(
    r"^(No|Yes\s*—\s*(stat card|framework diagram|3-step process|quote graphic)"
    r"(,\s*applies to.*)?)$",
    re.I,
)

HEADER_RE = re.compile(r"^(POST|THREAD)\s+(\d+)\b.*$", re.M)


def x_units(text: str) -> int:
    """X 가중 길이: URL 23유닛 고정, CJK·이모지 2유닛, 그 외 1유닛."""
    total = 0
    for part in URL_RE.split(text):
        for ch in part:
            cp = ord(ch)
            if cp >= 0x1F000 or (0x2190 <= cp <= 0x2BFF) or any(
                lo <= cp <= hi for lo, hi in WIDE_RANGES
            ):
                total += 2
            else:
                total += 1
    total += len(URL_RE.findall(text)) * X_URL_UNITS
    return total


def split_blocks(content: str):
    """POST n / THREAD n 헤더 기준으로 블록 분할. [(kind, num, body), ...]"""
    heads = list(HEADER_RE.finditer(content))
    blocks = []
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(content)
        blocks.append((m.group(1), int(m.group(2)), content[m.start():end]))
    return blocks


def strip_copy(lines):
    text = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def field(block: str, name: str):
    """필드 값 추출 — 대소문자 무시 (Part 5.2: 표기만 다르면 존재 인정)."""
    m = re.search(rf"^{re.escape(name)}\s*:\s*(.*)$", block, re.I | re.M)
    return m.group(1).strip() if m else None


class Report:
    def __init__(self):
        self.rows = []  # dicts: file, post, check, verdict, detail

    def add(self, file, post, check, verdict, detail):
        self.rows.append(
            {"file": str(file), "post": post, "check": check,
             "verdict": verdict, "detail": detail}
        )

    def count(self, verdict):
        return sum(1 for r in self.rows if r["verdict"] == verdict)


def lint_filenames(outputs: Path, rep: Report):
    for lane, pat in LANE_PATTERNS.items():
        lane_dir = outputs / lane
        if not lane_dir.is_dir():
            continue
        for f in sorted(lane_dir.iterdir()):
            if f.name.startswith(".") or f.is_dir():
                continue
            if f.suffix not in (".md", ".json"):
                continue
            if lane != "storyboards" and f.suffix == ".json":
                continue  # md 레인의 json 부속 파일은 계약 대상 아님
            if not pat.match(f.name):
                rep.add(f"outputs/{lane}/{f.name}", "-", "5.1 filename", "WARN",
                        f"파일명이 계약 패턴과 다릅니다 — expected: [client]-"
                        f"{'storyboard-[slug]' if lane == 'storyboards' else lane if lane not in ('videos',) else 'reels'}"
                        f"-[month]-[year]{f.suffix}")


def check_x_file(path: Path, rel: str, rep: Report):
    content = path.read_text(encoding="utf-8", errors="replace")
    for kind, num, block in split_blocks(content):
        label = f"{kind} {num}"
        if kind == "POST":
            m = re.search(r"^Char count\s*:\s*(\d+)\s*/\s*280", block, re.I | re.M)
            lines = block.splitlines()
            copy_lines, started = [], False
            for ln in lines[1:]:
                if re.match(r"^Type\s*:", ln, re.I):
                    started = True
                    continue
                if re.match(r"^Char count\s*:", ln, re.I):
                    break
                if started:
                    copy_lines.append(ln)
            copy = strip_copy(copy_lines)
            if not m:
                rep.add(rel, label, "5.2 Char count", "BLOCK",
                        "Char count: [n]/280 필드가 없습니다")
            elif copy:
                units = x_units(copy)
                stated = int(m.group(1))
                if units > 280:
                    rep.add(rel, label, "5.3 X CJK recount", "BLOCK",
                            f"재계산 {units}/280 units (표기 {stated}) — CJK 2유닛·URL 23유닛 가중 초과")
                elif abs(units - stated) > 2:
                    rep.add(rel, label, "5.3 X CJK recount", "WARN",
                            f"표기 {stated} ≠ 재계산 {units} units (한도 이내) — 표기 갱신 권장")
        else:  # THREAD
            tweets = re.findall(
                r"^(\d+)/[ \t](.*?)(?:\n(\d+)\s*/\s*280 chars)", block, re.S | re.M
            )
            if not tweets:
                rep.add(rel, label, "5.2 Char count", "BLOCK",
                        "스레드 개별 포스트의 [n]/280 chars 표기를 찾지 못했습니다")
            for idx, copy, stated in tweets:
                units = x_units(copy.strip())
                if units > 280:
                    rep.add(rel, f"{label} · {idx}/", "5.3 X CJK recount", "BLOCK",
                            f"재계산 {units}/280 units (표기 {stated}) — 가중 초과")
                elif abs(units - int(stated)) > 2:
                    rep.add(rel, f"{label} · {idx}/", "5.3 X CJK recount", "WARN",
                            f"표기 {stated} ≠ 재계산 {units} units — 표기 갱신 권장")
        _check_blotato(block, rel, label, rep)


def check_threads_file(path: Path, rel: str, rep: Report):
    content = path.read_text(encoding="utf-8", errors="replace")
    for kind, num, block in split_blocks(content):
        label = f"{kind} {num}"
        if kind == "POST":
            m = re.search(r"^Char count\s*:\s*(\d+)\s*/\s*500", block, re.I | re.M)
            lines = block.splitlines()
            copy_lines, started = [], False
            for ln in lines[1:]:
                if re.match(r"^Type\s*:", ln, re.I):
                    started = True
                    continue
                if re.match(r"^Char count\s*:", ln, re.I):
                    break
                if started:
                    copy_lines.append(ln)
            copy = strip_copy(copy_lines)
            if not m:
                rep.add(rel, label, "5.2 Char count", "BLOCK",
                        "Char count: [n]/500 필드가 없습니다")
            elif copy:
                n = len(copy)
                stated = int(m.group(1))
                if n > 500:
                    rep.add(rel, label, "5.3 Threads recount", "BLOCK",
                            f"재계산 {n}/500자 (표기 {stated}) — 한도 초과")
                elif abs(n - stated) > 5:
                    rep.add(rel, label, "5.3 Threads recount", "WARN",
                            f"표기 {stated} ≠ 재계산 {n}자 (한도 이내) — 표기 갱신 권장")
        else:  # THREAD
            posts = re.findall(
                r"^Post\s+(\d+)/\d+\s*:\s*\n(.*?)\n(\d+)\s*/\s*500 chars",
                block, re.S | re.M,
            )
            if not posts:
                rep.add(rel, label, "5.2 Char count", "BLOCK",
                        "스레드 개별 포스트의 [n]/500 chars 표기를 찾지 못했습니다")
            for idx, copy, stated in posts:
                n = len(copy.strip())
                if n > 500:
                    rep.add(rel, f"{label} · Post {idx}", "5.3 Threads recount", "BLOCK",
                            f"재계산 {n}/500자 (표기 {stated}) — 한도 초과")
                elif abs(n - int(stated)) > 5:
                    rep.add(rel, f"{label} · Post {idx}", "5.3 Threads recount", "WARN",
                            f"표기 {stated} ≠ 재계산 {n}자 — 표기 갱신 권장")
        _check_blotato(block, rel, label, rep)


def _check_blotato(block: str, rel: str, label: str, rep: Report):
    val = field(block, "BLOTATO FLAG")
    if val is None:
        rep.add(rel, label, "5.2 BLOTATO FLAG", "BLOCK",
                "BLOTATO FLAG: 필드가 없습니다 (/publisher 핸드오프 단절)")
    elif not BLOTATO_ALLOWED.match(val):
        rep.add(rel, label, "5.2 BLOTATO FLAG", "WARN",
                f"허용 값 밖: '{val}' — Yes — stat card / framework diagram / "
                "3-step process / quote graphic / No 중 하나여야 합니다")


def check_captions_file(path: Path, rel: str, rep: Report):
    content = path.read_text(encoding="utf-8", errors="replace")
    for kind, num, block in split_blocks(content):
        if kind != "POST":
            continue
        label = f"POST {num}"
        if field(block, "VISUAL DIRECTION") is None:
            rep.add(rel, label, "5.2 VISUAL DIRECTION", "BLOCK",
                    "VISUAL DIRECTION: 누락 — 디자이너 핸드오프 단절")
        for name in ("Platform", "CAPTION", "HASHTAGS", "CTA"):
            if field(block, name) is None and not re.search(
                rf"^{name}\b", block, re.I | re.M
            ):
                rep.add(rel, label, f"5.2 {name}", "WARN", f"{name}: 필드 누락")


def check_linkedin_file(path: Path, rel: str, rep: Report):
    content = path.read_text(encoding="utf-8", errors="replace")
    for kind, num, block in split_blocks(content):
        _check_blotato(block, rel, f"{kind} {num}", rep)


DISCLOSURE_RE = re.compile(r"(제공\s*받아|협찬|원고료|광고입니다|파트너십|수수료)")


def check_naver_file(path: Path, rel: str, rep: Report):
    content = path.read_text(encoding="utf-8", errors="replace")
    for kind, num, block in split_blocks(content):
        if kind != "POST":
            continue
        label = f"POST {num}"
        sponsored = field(block, "Sponsored")
        if sponsored is None:
            rep.add(rel, label, "5.2 Sponsored", "BLOCK",
                    "Sponsored: 필드 누락 — 대가성 판별 불가")
        elif sponsored.lower().startswith("yes") and not DISCLOSURE_RE.search(block):
            rep.add(rel, label, "5.2 대가성 고지", "BLOCK",
                    "Sponsored: Yes인데 본문에서 대가 제공 고지 문구를 찾지 못했습니다")
        if not re.search(r"VISUAL DIRECTION\s*:", block, re.I):
            rep.add(rel, label, "5.2 VISUAL DIRECTION", "BLOCK",
                    "IMAGE SLOT의 VISUAL DIRECTION: 누락")
        if field(block, "Main keyword") is None:
            rep.add(rel, label, "5.2 Main keyword", "WARN", "Main keyword: 필드 누락")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workroot", default=".", help="outputs/ 를 포함하는 워크스페이스 루트")
    ap.add_argument("--json", action="store_true", help="JSON으로 출력")
    args = ap.parse_args(argv)

    outputs = Path(args.workroot) / "outputs"
    if not outputs.is_dir():
        print(f"error: {outputs} 디렉토리가 없습니다", file=sys.stderr)
        return 2

    rep = Report()
    lint_filenames(outputs, rep)
    checkers = {
        "x": check_x_file, "threads": check_threads_file,
        "captions": check_captions_file, "linkedin": check_linkedin_file,
        "naver": check_naver_file,
    }
    scanned = 0
    for lane, fn in checkers.items():
        lane_dir = outputs / lane
        if not lane_dir.is_dir():
            continue
        for f in sorted(lane_dir.glob("*.md")):
            fn(f, f"outputs/{lane}/{f.name}", rep)
            scanned += 1

    blocks, warns = rep.count("BLOCK"), rep.count("WARN")
    if args.json:
        print(json.dumps(
            {"scanned": scanned, "block": blocks, "warn": warns, "findings": rep.rows},
            ensure_ascii=False, indent=2))
    else:
        print(f"## Mechanical Contract Validation (deterministic)\n")
        print(f"Scanned: {scanned} files | BLOCK {blocks} | WARN {warns}\n")
        if rep.rows:
            print("| File | Post | Check | Verdict | Detail |")
            print("|---|---|---|---|---|")
            for r in rep.rows:
                print(f"| {r['file']} | {r['post']} | {r['check']} | "
                      f"{r['verdict']} | {r['detail']} |")
        else:
            print("No mechanical findings — all scanned files satisfy the contract.")
    return 1 if blocks else 0


if __name__ == "__main__":
    sys.exit(main())
