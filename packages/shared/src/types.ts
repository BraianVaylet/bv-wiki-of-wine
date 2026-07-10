/**
 * Tipos de las entidades tal como las devuelve la API (camelCase).
 * Las filas de la DB (snake_case) se mapean acá en los repositories.
 */
import type { WineType } from './constants';

export interface PublicUser {
  id: number;
  alias: string;
  isAdmin: boolean;
  createdAt: number;
}

/** Autor de una reseña: lo mínimo para mostrarla. */
export interface ReviewAuthor {
  id: number;
  alias: string;
}

export interface WineryRef {
  id: number;
  name: string;
}

export interface Grape {
  id: number;
  name: string;
}

export interface WineListItem {
  id: number;
  name: string;
  type: WineType;
  vintage: number | null;
  winery: WineryRef | null;
  grapes: string[];
  country: string | null;
  region: string | null;
  /** `null` si el vino no tiene foto. */
  photoUrl: string | null;
  /** `null` cuando `reviewCount === 0`. Nunca 0. */
  avgOverall: number | null;
  reviewCount: number;
  reviewedByMe: boolean;
  createdBy: number | null;
  createdAt: number;
}

/** Promedios por eje. `null` = nadie puntuó ese eje (docs/02-data-model.md §4). */
export interface WineAggregates {
  reviewCount: number;
  avgOverall: number | null;
  avgTaste: number | null;
  avgAroma: number | null;
  avgBody: number | null;
  avgValueForMoney: number | null;
}

export interface Review {
  id: number;
  author: ReviewAuthor;
  overall: number;
  taste: number | null;
  aroma: number | null;
  body: number | null;
  valueForMoney: number | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
  isMine: boolean;
}

export interface WineDetail {
  wine: WineListItem;
  aggregates: WineAggregates;
  reviews: Review[];
}

/** Una reseña propia con el vino embebido (pantalla "Mis reseñas"). */
export interface MyReview extends Omit<Review, 'author' | 'isMine'> {
  wine: WineListItem;
}

export interface Paginated<T> {
  items: T[];
  /** `null` cuando no hay más páginas. */
  nextCursor: string | null;
}
