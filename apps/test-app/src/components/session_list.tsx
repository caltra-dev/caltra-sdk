import type { CaltraAgent, CaltraSession } from "@caltra/client";
import { Plus, Radio } from "lucide-react";
import { useState } from "react";

interface SessionListProps {
  agents: CaltraAgent[];
  creating: boolean;
  onCreate: (agentId: string) => Promise<void>;
  onSelect: (session: CaltraSession) => void;
  selectedSessionId?: string;
  sessions: CaltraSession[];
}

export function SessionList(props: SessionListProps) {
  const [agentId, setAgentId] = useState("");

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
          if (agentId) void props.onCreate(agentId);
        }}
      >
        <label htmlFor="agent">Open a channel</label>
        <div className="agent-picker">
          <select
            id="agent"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
          >
            <option value="">Choose an agent</option>
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <button disabled={!agentId || props.creating} type="submit" aria-label="Create session">
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
          <p className="empty-rail">No channels yet. Choose a published agent above.</p>
        )}
      </nav>
    </aside>
  );
}
