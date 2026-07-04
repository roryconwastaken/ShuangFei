# ShuangFei
A Chinese writing practice platform for teachers and students, built with Expo (React Native) and Supabase.

Teachers create a class, share a join code with students, and assign homework or run live whiteboard sessions. Students write on a grid-based canvas (the "BKB" - Buku Kotak Besar) modeled after Chinese character exercise books, and teachers can mark it up with red-ink annotations.

## Features

- **Role-based accounts** - sign up as a teacher or student; teachers get an auto-generated 6-character class code for students to join
- **BKB canvas** - grid-ruled writing surface for homework and notes, with pen/eraser tools, undo/redo, multi-page documents, and pinch-to-zoom
- **Homework workflow** - students submit homework, teachers review and annotate in red ink without touching the student's original strokes
- **Notes** - private, student-only documents (not shared with the teacher)
- **Live whiteboards** - teachers draw and broadcast in real time to selected students, with text boxes, multiple colors, and stroke widths
- **Realtime sync** - powered by Supabase Realtime

## Tech Stack

- **App:** Expo (React Native) + Expo Router, TypeScript
- **Canvas rendering:** `@shopify/react-native-skia` + `react-native-reanimated` (UI-thread drawing for low-latency strokes)
- **State:** Zustand
- **Backend:** Supabase (Postgres, Auth, Realtime, Row Level Security)

## Project Structure

```
apps/mobile/          Expo app
  app/                Screens (Expo Router), split by (auth), (student), (teacher)
  src/components/     Canvas components (BKBCanvas, WhiteboardCanvas, Toolbar)
  src/hooks/          Canvas/document state hooks
  src/lib/            Supabase client, local notes storage
  src/stores/         Zustand auth store
supabase/
  migrations/         SQL schema, RLS policies, realtime setup
  seed.sql
```

## Getting Started

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `a` for an Android simulator.

You'll need a Supabase project - apply the migrations in `supabase/migrations/` (in order) via the Supabase SQL editor, then create `apps/mobile/.env.local` with:

```
EXPO_PUBLIC_SUPABASE_URL=your-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
