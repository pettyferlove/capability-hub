export type IsoDateTime = string;

export type EpochMilliseconds = number;

export interface VersionedRecord {
  id: string;
  revision: number;
}
