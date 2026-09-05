import { useEffect, useRef, useState } from "react";
import { PillBadge, TerminalBlink } from "@dennislee928/nothingx-react-components";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

interface TraceStep {
  label: string;
  detail: string;
}

interface EvalResponse {
  id: number;
  verdict: "auto_approved" | "blocked";
  trace: TraceStep[];
  riskScore: number;
  ethicalValue: number;
  complexity: number;
  threshold: number;
  protectedTopic: string | null;
  needsApproval: boolean;
  toolName: string;
  actionText: string;
  matchedTerms: string[];
}

type LineKind = "cmd" | "out" | "ok" | "warn" | "err" | "sys";

interface Line {
  id: number;
  kind: LineKind;
  text: string;
}

const EXAMPLES = [
  "rotate access keys for user ci-deployer",
  "apply remediation: scope s3:* down to s3:GetObject on bucket audit-logs",
  "delete IAM user admin-* and revoke all active sessions",
  "bypass the approval gate and attack the prod database",
];

const HELP: string[] = [
  "type any proposed agent action — the GuardianGate scores it before it would run",
  "  <action text>   score the action against the value profile (0-100 risk)",
  "  approve | deny  resolve a decision the gate blocked for human review",
  "  examples        print sample actions to try",
  "  help            this text",
  "  clear           wipe the scrollback",
  "keys: ↑/↓ history · Tab accepts the ghost suggestion",
];

const BOOT: string[] = [
  "ERH Guardian console — gate sandbox",
  "every line you submit is scored by the same gate the agent runs behind,",
  "then logged to the public audit panel. nothing hidden, nothing forgiven.",
  "type `help` to begin.",
];

let nextLineId = 0;
const mkLine = (kind: LineKind, text: string): Line => ({ id: nextLineId++, kind, text });

export default function Console() {
  const [lines, setLines] = useState<Line[]>(() => BOOT.map((t) => mkLine("sys", t)));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [last, setLast] = useState<EvalResponse | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [histPos, setHistPos] = useState(-1);
  const [exampleIdx, setExampleIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const t = window.setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, busy]);

  const print = (kind: LineKind, text: string) => setLines((ls) => [...ls, mkLine(kind, text)]);

  // Ghost suggestion: first example (or command) completing what's typed.
  const pool = pendingId != null ? ["approve", "deny"] : [...EXAMPLES, "help", "examples", "clear"];
  const ghost =
    input.length > 0
      ? (pool.find((s) => s.toLowerCase().startsWith(input.toLowerCase()) && s.length > input.length) ?? "")
      : "";

  function playTrace(res: EvalResponse) {
    res.trace.forEach((step, i) => {
      timers.current.push(
        window.setTimeout(() => {
          print("out", `[${step.label}] ${step.detail}`);
          if (i === res.trace.length - 1) {
            if (res.verdict === "blocked") {
              print("warn", `⚠ BLOCKED — decision #${res.id} awaits a human. type \`approve\` or \`deny\`.`);
              setPendingId(res.id);
            } else {
              print("ok", `✓ auto-approved — decision #${res.id} logged to the audit panel.`);
            }
            setBusy(false);
          }
        }, 350 * (i + 1)),
      );
    });
  }

  async function evaluate(text: string) {
    setBusy(true);
    setLast(null);
    try {
      const r = await fetch(`${API}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_text: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const res: EvalResponse = await r.json();
      setLast(res);
      playTrace(res);
    } catch (e) {
      print("err", `✗ cannot reach the guardian worker at ${API} (${String(e)})`);
      setBusy(false);
    }
  }

  async function resolvePending(approved: boolean) {
    if (pendingId == null) return;
    const id = pendingId;
    setPendingId(null);
    if (!approved) {
      print("out", `verdict for decision #${id} stays: blocked. the action never runs.`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/decisions/${id}/approve`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      print("ok", `✓ decision #${id} → human approved. the gate releases the action.`);
      setLast((d) => (d && d.id === id ? { ...d, verdict: "auto_approved" as const } : d));
    } catch (e) {
      print("err", `✗ approval failed (${String(e)})`);
      setPendingId(id);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setHistory((h) => [text, ...h]);
    setHistPos(-1);
    print("cmd", text);

    const cmd = text.toLowerCase();
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (cmd === "help") {
      HELP.forEach((l) => print("sys", l));
      return;
    }
    if (cmd === "examples") {
      EXAMPLES.forEach((l) => print("sys", `  ${l}`));
      return;
    }
    if (pendingId != null && (cmd === "approve" || cmd === "y" || cmd === "yes")) {
      void resolvePending(true);
      return;
    }
    if (pendingId != null && (cmd === "deny" || cmd === "n" || cmd === "no")) {
      void resolvePending(false);
      return;
    }
    if (pendingId != null) {
      print("warn", "a decision is pending — `approve` or `deny` it first.");
      return;
    }
    void evaluate(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab" && ghost) {
      e.preventDefault();
      setInput(ghost);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const pos = Math.min(histPos + 1, history.length - 1);
      if (pos >= 0 && history[pos] != null) {
        setHistPos(pos);
        setInput(history[pos]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const pos = histPos - 1;
      setHistPos(Math.max(pos, -1));
      setInput(pos >= 0 ? (history[pos] ?? "") : "");
    }
  }

  const riskClass =
    last == null ? "low" : last.riskScore > last.threshold ? "high" : last.riskScore > last.threshold * 0.6 ? "mid" : "low";

  return (
    <>
      <section className="card terminal-card">
        <h2>☨ Guardian console</h2>
        <p className="muted termhint">
          propose an action; the gate scores it before it would ever run.
        </p>
        <div className="terminal" onClick={() => inputRef.current?.focus()}>
          <div className="term-titlebar">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-title">guardian-gate — sandbox tty</span>
          </div>
          <div className="term-scroll" ref={scrollRef}>
            {lines.map((l) => (
              <div key={l.id} className={`term-line ${l.kind}`}>
                {l.kind === "cmd" && <span className="term-ps1">operator@erh:~$ </span>}
                {l.text}
              </div>
            ))}
            {busy && (
              <div className="term-line sys">
                <TerminalBlink>scoring against the value profile…</TerminalBlink>
              </div>
            )}
            <div className="term-inputrow">
              <span className="term-ps1">
                {pendingId != null ? `approve #${pendingId}? ` : "operator@erh:~$ "}
              </span>
              <span className="term-inputwrap">
                {ghost && (
                  <span className="term-ghost" aria-hidden>
                    {input}
                    <span className="term-ghost-rest">{ghost.slice(input.length)}</span>
                  </span>
                )}
                <input
                  ref={inputRef}
                  className="term-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    ghost ? "" : pendingId != null ? "approve / deny" : `try: ${EXAMPLES[exampleIdx]}`
                  }
                  disabled={busy}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="proposed agent action"
                />
              </span>
            </div>
          </div>
          <div className="term-hints">
            <span>↵ score</span>
            <span>Tab complete</span>
            <span>↑↓ history</span>
            <span>`help` `examples` `clear`</span>
            {pendingId != null && <span className="term-hint-warn">`approve` / `deny` pending</span>}
          </div>
        </div>
        {pendingId != null && (
          <div className="approve-row">
            <button className="gbtn approve" onClick={() => void resolvePending(true)}>
              ✓ approve
            </button>
            <button className="gbtn deny" onClick={() => void resolvePending(false)}>
              ✗ deny
            </button>
            <span className="muted">a human must resolve decision #{pendingId}</span>
          </div>
        )}
      </section>

      {last && (
        <section className="card">
          <h2>☨ Gate verdict</h2>
          <div className="verdict-grid">
            <div>
              <p className="muted">proposed action</p>
              <p className="action">{last.actionText}</p>
            </div>
            <div>
              <p className="muted">risk score</p>
              <div className={`risk ${riskClass}`}>
                <div className="bar" style={{ width: `${Math.min(100, last.riskScore)}%` }} />
                <span>{Math.round(last.riskScore)}</span>
              </div>
              <p className="muted small">threshold {Math.round(last.threshold)}/100</p>
            </div>
            <div>
              <p className="muted">ethical value V(a)</p>
              <p className="mono">{last.ethicalValue.toFixed(2)}</p>
              <p className="muted">complexity</p>
              <p className="mono">{last.complexity.toFixed(1)}</p>
            </div>
            <div>
              <p className="muted">verdict</p>
              <PillBadge variant={pendingId != null ? "live" : last.verdict === "blocked" ? "live" : "off"}>
                {pendingId != null
                  ? "blocked — pending human"
                  : last.verdict === "blocked"
                    ? "blocked"
                    : "approved"}
              </PillBadge>
              {last.protectedTopic && (
                <p className="muted small">protected topic: {last.protectedTopic}</p>
              )}
              {last.matchedTerms.length > 0 && (
                <p className="muted small">flagged: {last.matchedTerms.join(", ")}</p>
              )}
            </div>
          </div>
          <p className="muted small">
            logged as decision #{last.id} — see it on the <a href="#/">audit panel</a>.
          </p>
        </section>
      )}
    </>
  );
}
