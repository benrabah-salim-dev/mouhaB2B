export const addMinutes = (date, mins = 0) => {
  if (!date) return null;
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + Number(mins || 0));
  return d;
};

export const fmtHour = (d) =>
  d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
