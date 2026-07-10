import {
  type CreateWineInput,
  MAX_GRAPES_PER_WINE,
  type UpdateWineInput,
  type WineDetail,
  type WineListItem,
  type WineQuery,
} from '@bv/shared';
import type { DB } from '../db/connection';
import { conflict, forbidden, notFound, validationError } from '../lib/errors';
import { deleteWineImage, saveWineImage } from '../lib/images';
import { now as defaultNow } from '../lib/time';
import { catalogRepo } from '../repositories/catalogRepo';
import { reviewRepo } from '../repositories/reviewRepo';
import { type WineListResult, type WineRecord, wineRepo } from '../repositories/wineRepo';
import type { Actor } from '../types';

/** Solo el creador o un admin puede tocar un vino. Lanza si no. */
function assertCanMutate(wine: WineRecord, actor: Actor): void {
  if (wine.createdBy !== actor.id && !actor.isAdmin) {
    throw forbidden('Solo quien cargó el vino puede editarlo.');
  }
}

export function createWineService(db: DB, now: () => number = defaultNow) {
  /** Resuelve nombres de uva a ids, creando las que falten. Dentro de una tx. */
  function resolveGrapeIds(names: string[], createdAt: number): number[] {
    return names.map((name) => catalogRepo.findOrCreateGrape(db, name, createdAt).id);
  }

  return {
    list(query: WineQuery, actor: Actor): WineListResult {
      return wineRepo.list(db, query, actor.id);
    },

    getDetail(wineId: number, actor: Actor): WineDetail {
      const wine = wineRepo.findListItem(db, wineId, actor.id);
      // El detalle de un vino borrado solo es visible para el admin (RN-4).
      const record = wineRepo.findById(db, wineId);
      if (!wine || !record) throw notFound('Ese vino no existe.');
      if (record.deletedAt !== null && !actor.isAdmin) throw notFound('Ese vino no existe.');

      return {
        wine,
        aggregates: wineRepo.aggregates(db, wineId),
        reviews: reviewRepo.listForWine(db, wineId, actor.id),
      };
    },

    create(input: CreateWineInput, actor: Actor): WineListItem {
      const createdAt = now();

      // Toda la creación en una transacción: si falla un insert de wine_grapes,
      // no queda un vino a medias sin uvas.
      const tx = db.transaction(() => {
        const wineryId = input.wineryName
          ? catalogRepo.findOrCreateWinery(db, input.wineryName, actor.id, createdAt).id
          : null;

        const duplicateId = wineRepo.findDuplicateId(db, input.name, wineryId, input.vintage);
        if (duplicateId !== null) {
          // El id viaja en details para que el front ofrezca "ir a reseñarlo".
          throw conflict('Ese vino ya está cargado.', [
            { path: 'wineId', message: String(duplicateId) },
          ]);
        }

        const wineId = wineRepo.insert(db, {
          name: input.name,
          type: input.type,
          vintage: input.vintage,
          wineryId,
          country: input.country,
          region: input.region,
          createdBy: actor.id,
          createdAt,
        });

        for (const grapeId of resolveGrapeIds(input.grapeNames, createdAt)) {
          wineRepo.addGrape(db, wineId, grapeId);
        }
        return wineId;
      });

      const wineId = tx();
      const created = wineRepo.findListItem(db, wineId, actor.id);
      if (!created) throw notFound('Ese vino no existe.');
      return created;
    },

    update(wineId: number, input: UpdateWineInput, actor: Actor): WineListItem {
      const wine = wineRepo.findById(db, wineId);
      if (!wine || wine.deletedAt !== null) throw notFound('Ese vino no existe.');
      assertCanMutate(wine, actor);

      if (input.grapeNames && input.grapeNames.length > MAX_GRAPES_PER_WINE) {
        throw validationError(`Como máximo ${MAX_GRAPES_PER_WINE} uvas por vino.`);
      }

      const updatedAt = now();
      const tx = db.transaction(() => {
        // `wineryName` presente pero vacío = quitar la bodega.
        let wineryId = wine.wineryId;
        if (input.wineryName !== undefined) {
          wineryId = input.wineryName
            ? catalogRepo.findOrCreateWinery(db, input.wineryName, actor.id, updatedAt).id
            : null;
        }

        const nextName = input.name ?? wine.name;
        const nextVintage = input.vintage !== undefined ? input.vintage : wine.vintage;
        const duplicateId = wineRepo.findDuplicateId(db, nextName, wineryId, nextVintage);
        if (duplicateId !== null && duplicateId !== wineId) {
          throw conflict('Ese vino ya está cargado.');
        }

        wineRepo.update(
          db,
          wineId,
          {
            name: input.name,
            type: input.type,
            vintage: input.vintage,
            wineryId: input.wineryName !== undefined ? wineryId : undefined,
            country: input.country,
            region: input.region,
          },
          updatedAt,
        );

        if (input.grapeNames) {
          wineRepo.replaceGrapes(db, wineId, resolveGrapeIds(input.grapeNames, updatedAt));
        }
      });
      tx();

      const updated = wineRepo.findListItem(db, wineId, actor.id);
      if (!updated) throw notFound('Ese vino no existe.');
      return updated;
    },

    /** Soft delete. Devuelve cuántas reseñas quedan ocultas (para el aviso). */
    remove(wineId: number, actor: Actor): { hiddenReviews: number } {
      const wine = wineRepo.findById(db, wineId);
      if (!wine || wine.deletedAt !== null) throw notFound('Ese vino no existe.');
      assertCanMutate(wine, actor);

      const hiddenReviews = wineRepo.countReviews(db, wineId);
      wineRepo.softDelete(db, wineId, now());
      return { hiddenReviews };
    },

    /** Nombre de archivo de la foto de un vino, validando existencia. Para servirla. */
    getPhotoFile(wineId: number): string {
      const wine = wineRepo.findById(db, wineId);
      if (!wine || wine.deletedAt !== null || !wine.photoFile) throw notFound('Sin foto.');
      return wine.photoFile;
    },

    /** Sube/reemplaza la foto. Re-codifica a WebP y borra la anterior. */
    async setPhoto(wineId: number, bytes: Buffer, actor: Actor): Promise<{ photoUrl: string }> {
      const wine = wineRepo.findById(db, wineId);
      if (!wine || wine.deletedAt !== null) throw notFound('Ese vino no existe.');
      assertCanMutate(wine, actor);

      const fileName = await saveWineImage(bytes);
      wineRepo.setPhotoFile(db, wineId, fileName, now());
      if (wine.photoFile) await deleteWineImage(wine.photoFile);
      return { photoUrl: `/api/wines/${wineId}/photo` };
    },

    async removePhoto(wineId: number, actor: Actor): Promise<void> {
      const wine = wineRepo.findById(db, wineId);
      if (!wine || wine.deletedAt !== null) throw notFound('Ese vino no existe.');
      assertCanMutate(wine, actor);
      if (!wine.photoFile) return;
      wineRepo.setPhotoFile(db, wineId, null, now());
      await deleteWineImage(wine.photoFile);
    },
  };
}

export type WineService = ReturnType<typeof createWineService>;
