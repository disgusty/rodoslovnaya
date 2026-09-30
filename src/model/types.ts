export type Gender = 'm' | 'f' | 'u';

export interface DatePlace {
  date: string; // free-form, e.g. "12.03.1921" or "около 1850"
  place: string;
}

export interface LifeEvent {
  id: string;
  date: string;
  title: string;
  place: string;
  description: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
  caption: string;
}

export interface Person {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string; // отчество
  maidenName: string; // девичья фамилия
  gender: Gender;
  living: boolean;
  birth: DatePlace;
  death: DatePlace;
  burial: string;
  occupation: string;
  education: string;
  residence: string;
  bio: string;
  notes: string;
  photo: string | null; // data URL
  gallery: Attachment[];
  documents: Attachment[];
  events: LifeEvent[];
  cardColor: string | null;
}

export type FamilyType = 'married' | 'partners' | 'divorced';

/** A couple (or single parent) together with their children — mirrors GEDCOM FAM. */
export interface Family {
  id: string;
  partners: string[]; // 1 or 2 person ids
  children: string[];
  type: FamilyType;
  date: string; // marriage date
  place: string;
}

export type BranchDirection = 'descendants' | 'ancestors';

/** A whole line of the family highlighted by color. */
export interface Branch {
  id: string;
  name: string;
  rootId: string;
  direction: BranchDirection;
  color: string;
  comment: string;
  visible: boolean;
}

/** Style for one individual connection line. Keyed by edge id. */
export interface LinkStyle {
  color: string;
  comment: string;
}

export interface TreeData {
  version: 1;
  name: string;
  people: Record<string, Person>;
  families: Record<string, Family>;
  branches: Branch[];
  links: Record<string, LinkStyle>;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type DesignVersion = 'md1' | 'md3' | 'w95';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
/** Direction in which generations grow (screen). tb = top→bottom, rotated clockwise. */
export type Orientation = 'tb' | 'rl' | 'bt' | 'lr';
export type Lang = 'ru' | 'en';

export interface Settings {
  theme: ThemeMode;
  design: DesignVersion;
  accent: string;
  lang: Lang;
  corner: Corner;
  orientation: Orientation;
  showLinkComments: boolean;
}
