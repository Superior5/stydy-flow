export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  planHandled: boolean;
}
export interface Resource {
  id?: string;
  title: string;
  url: string;
}
export interface Transfer {
  id: string;
  topicId: string;
  fromDate: string;
  toDate: string;
  kind: "auto" | "manual";
  createdAt: string;
  title?: string;
  personal?: boolean;
}
export interface Topic {
  id: string;
  title: string;
  notes: string;
  status: "pending" | "completed";
  originalDate: string;
  scheduledDate: string;
  completedAt: string | null;
  resources: Resource[];
  history: Transfer[];
}
export interface Stats {
  completed: number;
  planned: number;
  pending: number;
  carriedToday: number;
  streak: number;
  percentage: number;
  totalCompleted: number;
  activity: { date: string; count: number }[];
}
export interface Week {
  calendar?: CalendarInfo;
  end?: string;
  start: string;
  today: string;
  topics: Topic[];
  transfers: Transfer[];
  stats: Stats;
}

export interface CalendarInfo {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  isDefault: boolean;
  creatorName: string;
  topicCount: number;
  role: "creator" | "reader";
}

export interface PersonalNote {
  text: string;
  updatedAt: string | null;
}
