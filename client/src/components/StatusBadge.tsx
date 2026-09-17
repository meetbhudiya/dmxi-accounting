const COLORS: Record<string, string> = {
  DRAFT: "gray",
  SENT: "blue",
  PARTIALLY_PAID: "yellow",
  PAID: "green",
  OVERDUE: "red",
  VOID: "gray",
  UNPAID: "yellow",
  CANCELLED: "gray",
};

export default function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? "gray";
  return <span className={`badge badge-${color}`}>{status.replace(/_/g, " ")}</span>;
}
