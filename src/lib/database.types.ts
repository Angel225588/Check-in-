export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PaymentAction = 'points' | 'room_charge' | 'pay_onsite' | 'pass'

export type BillingAction = PaymentAction | 'walkin'

export type DocType = 'clients' | 'vip' | 'unknown'

export type VerificationStatus = 'pending' | 'verified' | 'discrepancies'

export type SessionStatus = 'active' | 'closed'

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          date: string
          status: SessionStatus
          property_code: string
          created_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          date: string
          status?: SessionStatus
          property_code: string
          created_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          date?: string
          status?: SessionStatus
          property_code?: string
          created_at?: string
          closed_at?: string | null
        }
      }
      clients: {
        Row: {
          id: string
          session_id: string
          room_number: string
          room_type: string
          rtc: string
          confirmation_number: string
          name: string
          arrival_date: string
          departure_date: string
          reservation_status: string
          adults: number
          children: number
          rate_code: string
          package_code: string
          is_vip: boolean
          vip_level: string
          vip_notes: string
          breakfast_included: boolean
          payment_action: PaymentAction | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          room_number: string
          room_type?: string
          rtc?: string
          confirmation_number?: string
          name: string
          arrival_date?: string
          departure_date?: string
          reservation_status?: string
          adults?: number
          children?: number
          rate_code?: string
          package_code?: string
          is_vip?: boolean
          vip_level?: string
          vip_notes?: string
          breakfast_included?: boolean
          payment_action?: PaymentAction | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          room_number?: string
          room_type?: string
          rtc?: string
          confirmation_number?: string
          name?: string
          arrival_date?: string
          departure_date?: string
          reservation_status?: string
          adults?: number
          children?: number
          rate_code?: string
          package_code?: string
          is_vip?: boolean
          vip_level?: string
          vip_notes?: string
          breakfast_included?: boolean
          payment_action?: PaymentAction | null
          created_at?: string
        }
      }
      check_ins: {
        Row: {
          id: string
          session_id: string
          client_id: string | null
          room_number: string
          client_name: string
          people_entered: number
          checked_in_by: string | null
          timestamp: string
        }
        Insert: {
          id?: string
          session_id: string
          client_id?: string | null
          room_number: string
          client_name: string
          people_entered?: number
          checked_in_by?: string | null
          timestamp?: string
        }
        Update: {
          id?: string
          session_id?: string
          client_id?: string | null
          room_number?: string
          client_name?: string
          people_entered?: number
          checked_in_by?: string | null
          timestamp?: string
        }
      }
      pdf_uploads: {
        Row: {
          id: string
          session_id: string
          file_name: string
          file_url: string
          doc_type: DocType
          raw_text: string
          extraction_data: Json
          verification_status: VerificationStatus
          verification_report: Json | null
          pages: number
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          file_name: string
          file_url?: string
          doc_type?: DocType
          raw_text?: string
          extraction_data?: Json
          verification_status?: VerificationStatus
          verification_report?: Json | null
          pages?: number
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          file_name?: string
          file_url?: string
          doc_type?: DocType
          raw_text?: string
          extraction_data?: Json
          verification_status?: VerificationStatus
          verification_report?: Json | null
          pages?: number
          created_at?: string
        }
      }
      billing_records: {
        Row: {
          id: string
          session_id: string
          client_id: string | null
          room_number: string
          client_name: string
          action: BillingAction
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          client_id?: string | null
          room_number: string
          client_name: string
          action: BillingAction
          notes?: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          client_id?: string | null
          room_number?: string
          client_name?: string
          action?: BillingAction
          notes?: string
          created_at?: string
        }
      }
    }
  }
}
