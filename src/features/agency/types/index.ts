export interface AgencyRow {
  agency_line: string;
  webinar_run_id: string;
  run_label: string;
  leads: number;
  showed: number;
  showup_rate: number | null;
  buyers: number;
  conversion_rate: number | null;
  ad_spend: number | null;
  cpl: number | null;
  cpa: number | null;
}
