import type { CaltraSession } from "@caltra/client";
import { Plus, Radio } from "lucide-react";

interface SessionListProps {
  agent?: { id: string; name: string };
  creating: boolean;
  onCreate: () => Promise<void>;
  onSelect: (session: CaltraSession) => void;
  selectedSessionId?: string;
  sessions: CaltraSession[];
}

export function SessionList(props: SessionListProps) {

  return (
    <aside className="session-rail">
      <div className="brand-lockup">
        <span className="brand-mark"><Radio size={15} strokeWidth={2.5} /></span>
        <div>
          <strong>CALTRA</strong>
          <span>SDK SIGNAL ROOM</span>
        </div>
      </div>

      <form
        className="new-session"
        onSubmit={(event) => {
          event.preventDefault();
          if (props.agent) void props.onCreate();
        }}
      >
        <label htmlFor="agent">Open a channel</label>
        <div className="agent-picker">
          <input id="agent" readOnly value={props.agent?.name ?? "Loading agent…"} />
          <button disabled={!props.agent || props.creating} type="submit" aria-label="Create session">
            <Plus size={18} />
          </button>
        </div>
      </form>

      <div className="rail-label">
        <span>SESSIONS</span>
        <span>{String(props.sessions.length).padStart(2, "0")}</span>
      </div>
      <nav className="session-list" aria-label="Caltra sessions">
        {props.sessions.map((session) => (
          <button
            className={props.selectedSessionId === session.id ? "session-item active" : "session-item"}
            key={session.id}
            onClick={() => props.onSelect(session)}
            type="button"
          >
            <span className="session-agent">{session.agent.name}</span>
            <span className="session-meta">
              {session.status} · {new Date(session.updated_at).toLocaleDateString()}
            </span>
          </button>
        ))}
        {props.sessions.length === 0 && (
          <p className="empty-rail">No channels yet. Open a session in your agent above.</p>
        )}
      </nav>
    </aside>
  );
}
