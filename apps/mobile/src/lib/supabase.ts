// ============================================================
// Requires:
//   npm install @supabase/supabase-js
//   npm install react-native-url-polyfill
//   npm install @react-native-async-storage/async-storage
//
// In apps/mobile/index.js (or App entry), add at the top:
//   import 'react-native-url-polyfill/auto';
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,          // persists session across app restarts
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,      // required for React Native (no browser URL)
  },
});

// ============================================================
// TypeScript types matching the DB schema
// ============================================================

export type Role = 'student' | 'teacher';
export type DocumentType = 'homework' | 'notes' | 'whiteboard';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  class_code: string | null;
  created_at: string;
}

export interface StudentTeacher {
  id: string;
  student_id: string;
  teacher_id: string;
  joined_at: string;
}

export interface Document {
  id: string;
  owner_id: string;
  title: string;
  type: DocumentType;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentPage {
  id: string;
  document_id: string;
  page_number: number;
  student_strokes: Stroke[];
  created_at: string;
  updated_at: string;
}

export interface WhiteboardShare {
  id: string;
  document_id: string;
  teacher_id: string;
  is_active: boolean;
  shared_at: string;
}

export interface WhiteboardStudentShare {
  id: string;
  document_id: string;
  student_id: string;
  added_at: string;
}

export interface TeacherAnnotation {
  id: string;
  page_id: string;
  teacher_id: string;
  strokes: Stroke[];
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  pen_size_s: number;
  pen_size_m: number;
  pen_size_l: number;
  pen_colors: string[]; // always length 5 — teacher whiteboard swatches
  created_at: string;
  updated_at: string;
}

// ============================================================
// Canvas stroke types
// ============================================================

export interface TextBox {
  id: string;
  x: number;       // canvas-space coordinate
  y: number;
  text: string;
  fontSize: number; // canvas-space font size (scales with zoom)
  color: string;
}

export interface StrokePoint {
  x: number;
  y: number;
  t: number;        // timestamp ms (for playback / future use)
}

export interface Stroke {
  id: string;
  tool: 'pen' | 'eraser';
  color: string;    // '#1a1a1a' for students, '#e63946' for teacher annotations
  width: number;    // stroke width in dp
  points: StrokePoint[];
}
