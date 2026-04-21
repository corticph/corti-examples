export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function initialsFromName(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function outcomeLabel(outcomeType: "none" | "prescription" | "referral") {
  switch (outcomeType) {
    case "prescription":
      return "Prescription";
    case "referral":
      return "Referral";
    default:
      return "Advice only";
  }
}

export function appointmentStatusLabel(status: "upcoming" | "checked-in" | "in-progress" | "completed") {
  switch (status) {
    case "checked-in":
      return "Checked in";
    case "in-progress":
      return "In progress";
    case "completed":
      return "Completed";
    default:
      return "Upcoming";
  }
}