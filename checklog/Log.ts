export interface Log {
    id?: number; // only for case of auto-shift
    event_code: number;
    event_type: number;
    origin_code: number;
    record_status: number;
    start_date?: string;
    end_date?: string;
    vehicleId: number;
    odometr: number;
    engine_hours: number;
    inspection: boolean;
    document: string;
    driver_signature: string;
    certify_date: string;
    creator: string;
    trailer: string | null,
    sequenceId: number | null,
    address: string;
    driverId: number;
    shipping_document: string | null;
    malfunction: string | null;
    diagnostic: string | null;
    is_blocked: boolean | null;
    malfunction_diagnostic: string;
    codriverId: number;
    note: string;
    debug_info: string;
    vin_number: string | null
    status: string;
    temp_end_date?: string // only for case of auto-shift
    old_end_date?: string // only for case of auto-shift
    old_start_date?: string // only for case of auto-shift
}