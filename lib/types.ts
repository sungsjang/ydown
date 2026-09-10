export const JOB_STATUSES = [
  "queued",
  "claimed",
  "downloading",
  "postprocessing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type OutputType = "video" | "mp3";
export type PlaylistMode = "single" | "full";

export interface Job {
  id: string;
  url: string;
  outputs: OutputType[];
  playlist_mode: PlaylistMode;
  status: JobStatus;
  progress: number;
  stage: string | null;
  title: string | null;
  playlist_title: string | null;
  result_files: string[];
  error_code: string | null;
  error_message: string | null;
  cancel_requested: boolean;
  attempt_count: number;
  agent_id: string | null;
  created_at: string;
  claimed_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  completed_at: string | null;
}

export interface AgentInfo {
  agent_id: string;
  hostname: string | null;
  version: string | null;
  last_seen_at: string;
  current_job_id: string | null;
}
