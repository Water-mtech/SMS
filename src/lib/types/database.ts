/**
 * Database contract.
 *
 * Mirrors `supabase/migrations` exactly. Regenerate with
 * `supabase gen types typescript --local` after changing a migration, or keep
 * this file in step by hand — the whole application is typed off it.
 */

export type StudentStatus = 'active' | 'graduated' | 'transferred' | 'withdrawn';
export type Gender = 'male' | 'female';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'online';
export type TermLabel = 'first' | 'second' | 'third';
export type AppRole = 'admin' | 'bursar' | 'teacher';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: AppRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          role?: AppRole;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      sections: {
        Row: {
          id: string;
          name: string;
          slug: string;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; slug: string; display_order: number };
        Update: Partial<Database['public']['Tables']['sections']['Insert']>;
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          section_id: string;
          name: string;
          slug: string;
          promotion_order: number;
          is_terminal: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          section_id: string;
          name: string;
          slug: string;
          promotion_order: number;
          is_terminal?: boolean;
        };
        Update: Partial<Database['public']['Tables']['classes']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'classes_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
        ];
      };
      academic_sessions: {
        Row: {
          id: string;
          name: string;
          starts_on: string;
          ends_on: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { name: string; starts_on: string; ends_on: string };
        Update: Partial<Database['public']['Tables']['academic_sessions']['Insert']>;
        Relationships: [];
      };
      terms: {
        Row: {
          id: string;
          session_id: string;
          label: TermLabel;
          sequence: number;
          starts_on: string;
          ends_on: string;
          is_current: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          session_id: string;
          label: TermLabel;
          sequence: number;
          starts_on: string;
          ends_on: string;
          is_current?: boolean;
        };
        Update: Partial<Database['public']['Tables']['terms']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'terms_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'academic_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      students: {
        Row: {
          id: string;
          admission_number: string;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          gender: Gender | null;
          date_of_birth: string | null;
          class_id: string;
          guardian_name: string | null;
          guardian_phone: string | null;
          guardian_email: string | null;
          status: StudentStatus;
          admitted_on: string;
          archived_at: string | null;
          archived_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          admission_number: string;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          gender?: Gender | null;
          date_of_birth?: string | null;
          class_id: string;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          guardian_email?: string | null;
          status?: StudentStatus;
          admitted_on?: string;
        };
        Update: Partial<Database['public']['Tables']['students']['Insert']> & {
          archived_at?: string | null;
          archived_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'students_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      stationery_items: {
        Row: {
          id: string;
          section_id: string;
          name: string;
          description: string | null;
          unit_price: number;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          section_id: string;
          name: string;
          description?: string | null;
          unit_price?: number;
          display_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['stationery_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'stationery_items_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'sections';
            referencedColumns: ['id'];
          },
        ];
      };
      stationery_issues: {
        Row: {
          id: string;
          student_id: string;
          item_id: string;
          term_id: string;
          quantity: number;
          issued_at: string;
          issued_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          student_id: string;
          item_id: string;
          term_id: string;
          quantity?: number;
          issued_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['stationery_issues']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'stationery_issues_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stationery_issues_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'stationery_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stationery_issues_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stationery_issues_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      fee_structures: {
        Row: {
          id: string;
          class_id: string;
          term_id: string;
          amount: number;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          class_id: string;
          term_id: string;
          amount: number;
          description?: string | null;
        };
        Update: Partial<Database['public']['Tables']['fee_structures']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'fee_structures_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_structures_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
        ];
      };
      fee_accounts: {
        Row: {
          id: string;
          student_id: string;
          term_id: string;
          class_id: string;
          arrears: number;
          current_bill: number;
          total_paid: number;
          /** Generated column: arrears + current_bill - total_paid. */
          balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          student_id: string;
          term_id: string;
          class_id: string;
          arrears?: number;
          current_bill?: number;
          total_paid?: number;
        };
        Update: Partial<Omit<Database['public']['Tables']['fee_accounts']['Insert'], 'student_id' | 'term_id'>>;
        Relationships: [
          {
            foreignKeyName: 'fee_accounts_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_accounts_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_accounts_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
      fee_payments: {
        Row: {
          id: string;
          account_id: string;
          student_id: string;
          term_id: string;
          receipt_number: string;
          amount: number;
          method: PaymentMethod;
          reference: string | null;
          notes: string | null;
          balance_before: number;
          balance_after: number;
          paid_at: string;
          recorded_by: string | null;
          voided_at: string | null;
          voided_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          student_id: string;
          term_id: string;
          receipt_number: string;
          amount: number;
          method?: PaymentMethod;
          reference?: string | null;
          notes?: string | null;
          balance_before: number;
          balance_after: number;
          paid_at?: string;
          recorded_by?: string | null;
        };
        Update: { voided_at?: string | null; voided_reason?: string | null };
        Relationships: [
          {
            foreignKeyName: 'fee_payments_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'fee_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_payments_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_payments_term_id_fkey';
            columns: ['term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fee_payments_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      promotion_batches: {
        Row: {
          id: string;
          from_class_id: string;
          to_class_id: string | null;
          from_term_id: string;
          to_term_id: string;
          student_count: number;
          graduated_count: number;
          rolled_over_total: number;
          performed_by: string | null;
          created_at: string;
        };
        Insert: {
          from_class_id: string;
          to_class_id?: string | null;
          from_term_id: string;
          to_term_id: string;
          student_count?: number;
          graduated_count?: number;
          rolled_over_total?: number;
          performed_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['promotion_batches']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'promotion_batches_from_class_id_fkey';
            columns: ['from_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_batches_to_class_id_fkey';
            columns: ['to_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_batches_from_term_id_fkey';
            columns: ['from_term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_batches_to_term_id_fkey';
            columns: ['to_term_id'];
            isOneToOne: false;
            referencedRelation: 'terms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_batches_performed_by_fkey';
            columns: ['performed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      promotion_records: {
        Row: {
          id: string;
          batch_id: string;
          student_id: string;
          from_class_id: string;
          to_class_id: string | null;
          rolled_over_balance: number;
          graduated: boolean;
          created_at: string;
        };
        Insert: {
          batch_id: string;
          student_id: string;
          from_class_id: string;
          to_class_id?: string | null;
          rolled_over_balance?: number;
          graduated?: boolean;
        };
        Update: Partial<Database['public']['Tables']['promotion_records']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'promotion_records_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'promotion_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_records_student_id_fkey';
            columns: ['student_id'];
            isOneToOne: false;
            referencedRelation: 'students';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_records_from_class_id_fkey';
            columns: ['from_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'promotion_records_to_class_id_fkey';
            columns: ['to_class_id'];
            isOneToOne: false;
            referencedRelation: 'classes';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_student_stationery: {
        Args: { p_student_id: string; p_term_id: string; p_item_ids: string[] };
        Returns: Database['public']['Tables']['stationery_issues']['Row'][];
      };
      class_stationery_matrix: {
        Args: { p_class_id: string; p_term_id: string };
        Returns: {
          student_id: string;
          admission_number: string;
          full_name: string;
          issued_item_ids: string[];
        }[];
      };
      sync_class_fee_bills: {
        Args: { p_class_id: string; p_term_id: string };
        Returns: number;
      };
      record_fee_payment: {
        Args: {
          p_student_id: string;
          p_term_id: string;
          p_amount: number;
          p_method?: PaymentMethod;
          p_reference?: string | null;
          p_notes?: string | null;
          p_paid_at?: string;
        };
        Returns: Database['public']['Tables']['fee_payments']['Row'];
      };
      void_fee_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: Database['public']['Tables']['fee_payments']['Row'];
      };
      promote_class: {
        Args: { p_from_class_id: string; p_from_term_id: string; p_to_term_id: string };
        Returns: Database['public']['Tables']['promotion_batches']['Row'];
      };
      bulk_import_students: {
        Args: { p_class_id: string; p_term_id: string; p_rows: Json };
        Returns: { imported: number; skipped: number }[];
      };
      archive_student: {
        Args: { p_student_id: string; p_reason?: string | null };
        Returns: Database['public']['Tables']['students']['Row'];
      };
      restore_student: {
        Args: { p_student_id: string };
        Returns: Database['public']['Tables']['students']['Row'];
      };
    };
    Enums: {
      student_status: StudentStatus;
      gender: Gender;
      payment_method: PaymentMethod;
      term_label: TermLabel;
      app_role: AppRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/* -------------------------------------------------------------------------- */
/* Convenience aliases used throughout the app                                 */
/* -------------------------------------------------------------------------- */

type Tables = Database['public']['Tables'];

export type Profile = Tables['profiles']['Row'];
export type Section = Tables['sections']['Row'];
export type ClassRow = Tables['classes']['Row'];
export type AcademicSession = Tables['academic_sessions']['Row'];
export type Term = Tables['terms']['Row'];
export type Student = Tables['students']['Row'];
export type StationeryItem = Tables['stationery_items']['Row'];
export type StationeryIssue = Tables['stationery_issues']['Row'];
export type FeeStructure = Tables['fee_structures']['Row'];
export type FeeAccount = Tables['fee_accounts']['Row'];
export type FeePayment = Tables['fee_payments']['Row'];
export type PromotionBatch = Tables['promotion_batches']['Row'];
export type PromotionRecord = Tables['promotion_records']['Row'];

export type StudentInsert = Tables['students']['Insert'];
export type StationeryItemInsert = Tables['stationery_items']['Insert'];
export type FeeStructureInsert = Tables['fee_structures']['Insert'];

/** A class joined with the section it belongs to. */
export interface ClassWithSection extends ClassRow {
  section: Pick<Section, 'id' | 'name' | 'slug' | 'display_order'>;
}

/** One row of the stationery matrix, resolved for rendering. */
export interface MatrixRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  issuedItemIds: Set<string>;
}

/** A student's ledger line for a term, joined with identity fields. */
export interface LedgerRow {
  accountId: string | null;
  studentId: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  arrears: number;
  currentBill: number;
  totalPaid: number;
  balance: number;
}

/** Everything a receipt needs to render without further fetching. */
export interface ReceiptData {
  receiptNumber: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  termLabel: TermLabel;
  sessionName: string;
  amountPaid: number;
  balanceBefore: number;
  balanceAfter: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
}
