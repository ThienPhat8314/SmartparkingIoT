
export interface Spot {
  id: string;
  label: string;
  occupied: boolean;
  currentSessionId: string | null;
  lastChange: number;
}

export interface Session {
  id: string;
  lotId: string;
  spotId: string;
  rfid: string;
  plate: string;
  plateLower: string;
  inAt: number;
  outAt: number | null;
  fee: number | null;
  imagePathIn: string | null;
  imagePathOut: string | null;
  status: 'open' | 'closed';
  feeType?: 'hourly' | 'daily';
}

export interface Device {
  id: string;
  lastSeen: number;
  status: 'OK' | 'WARN' | 'OFF';
}

export interface Summary {
  occupied: number;
  total: number;
  occupancyPercent: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface User {
  email: string | null;
  uid: string;
  isAdmin: boolean;
  name?: string;
}

export interface FeeSettings {
    feeMethod: 'hourly' | 'daily';
    hourlyRate: number;
    freeMinutes: number;
    dailyRate: number;
}

export type ViewMode = 'mobile' | 'web';
export type Theme = 'light' | 'dark';