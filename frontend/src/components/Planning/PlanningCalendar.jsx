import React, { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import api from "../../api";

function toISODate(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function PlanningCalendar({ mode = "vehicules" }) {
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState([]);
  const [events, setEvents] = useState([]);

  const endpoint = useMemo(() => {
    return mode === "chauffeurs"
      ? "/planning/chauffeurs/"
      : "/planning/vehicules/";
  }, [mode]);

  const loadRange = async (startStr, endStr) => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint, {
        params: { start: startStr, end: endStr },
      });
      setResources(data?.resources || []);
      setEvents(data?.events || []);
    } catch (e) {
      console.error(e);
      setResources([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // charge “aujourd’hui + 7 jours” au 1er rendu
  useEffect(() => {
    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    loadRange(toISODate(now), toISODate(end));
    // eslint-disable-next-line
  }, [endpoint]);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h5 className="mb-0">
            {mode === "chauffeurs" ? "Planning Chauffeurs" : "Planning Véhicules"}
          </h5>
          {loading && <span className="text-muted">Chargement…</span>}
        </div>

        <FullCalendar
          plugins={[resourceTimelinePlugin, interactionPlugin]}
          initialView="resourceTimelineDay"
          height="75vh"
          nowIndicator
          editable={false}
          selectable={false}
          resourceAreaWidth="28%"
          resourceAreaHeaderContent={
            mode === "chauffeurs" ? "Chauffeurs" : "Véhicules"
          }
          resources={resources}
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "resourceTimelineDay,resourceTimelineWeek",
          }}
          datesSet={(arg) => {
            // arg.start / arg.end = dates affichées
            loadRange(toISODate(arg.start), toISODate(arg.end));
          }}
          eventClick={(info) => {
            const missionId = info?.event?.extendedProps?.mission_id;
            if (missionId) {
              // adapte ta route
              window.location.href = `/missions/${missionId}`;
            }
          }}
          eventContent={(arg) => {
            // rendu custom plus lisible
            return (
              <div style={{ fontSize: 12, lineHeight: 1.15 }}>
                <b>{arg.event.title}</b>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
