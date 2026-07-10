# 00 · Investigación — apps existentes y qué tomar de cada una

Antes de diseñar, mirar qué ya existe. El objetivo no es competir con Vivino: es
entender qué resuelven bien, qué resuelven de más, y dónde está el hueco que
justifica escribir esto.

---

## 1. El problema real

> "Probamos muchos vinos y nos olvidamos cuáles ya tomamos y si nos gustaron."

Eso es un problema de **memoria compartida**, no de cata. Las apps del mercado
resuelven otro problema: descubrimiento (Vivino), inventario de bodega
(CellarTracker) o red social de sommeliers (Delectable). Ninguna está pensada
para "somos dos y queremos acordarnos".

Consecuencia de diseño: **la velocidad de carga gana sobre la riqueza del dato.**
Si registrar un vino cuesta más de ~30 segundos durante una cena, la app no se usa.

---

## 2. Competidores

| App | Problema que resuelve | Modelo de puntuación | Qué copiar | Qué evitar |
|-----|----------------------|----------------------|------------|------------|
| **[Vivino](https://www.vivino.com/en/app)** | Descubrir y comprar. ~60M+ usuarios, escaneo de etiqueta, comparación de precios. | 1 estrella global (1–5, medias estrellas). | La estrella única como acción primaria. La foto de etiqueta como identidad visual del vino. | Ads, catálogo global, precios, "wine styles", gamificación. |
| **[CellarTracker](https://www.cellartracker.com/)** | Inventario de bodega para coleccionistas. Desde 2003, ~13M notas de cata. | Nota 100 puntos + notas técnicas largas. | Nada del modelo de datos. Sí: la idea de que las notas de otros suman valor. | Escala 100 puntos, drinking windows, inventario por botella, jerga de cata. |
| **[Delectable](https://apps.apple.com/us/app/delectable-scan-rate-wine/id512106648)** | Red social de vino; reseñas de sommeliers verificados. | Estrella global + nota libre. | **El modelo exacto que queremos**: foto + estrella + nota corta. UX limpia. | El grafo social (follows, feed público). |
| **Wine Ring / Sommo / InVintory** | Recomendación por ML / cellars premium. | Varía. | — | Todo. Sobredimensionado. |

**Fuentes:** [Best Wine Apps 2026 (Sommo)](https://sommo.app/blog/best-wine-apps-2026/) ·
[CellarTracker vs Vivino](https://cellarlog.app/vs/cellartracker-vs-vivino) ·
[Best Wine Tracking Apps (Drinkist)](https://drinkist.app/blog/best-wine-tracking-app) ·
[InVintory — Best Wine Apps](https://invintory.com/blog/best-wine-apps-top-tools-for-collectors-compared/)

---

## 3. El hueco

Ninguna de las tres es una **wiki privada de pocas personas**:

- Vivino y Delectable son catálogos globales: tu reseña se pierde en un mar de
  reseñas de desconocidos. Vos querés saber qué opinó **tu pareja**, no un
  usuario aleatorio de Ohio.
- CellarTracker asume que tenés una bodega física con botellas numeradas.
- Ninguna te deja definir **tus propios ejes** de opinión con el peso que vos
  querés (precio/calidad importa mucho más que "taninos" para un consumidor
  normal).

**Nuestra tesis:** un catálogo chico y compartido, con una estrella global rápida
y ejes opcionales, donde el valor está en que **conocés a las 2–5 personas que
reseñaron**.

---

## 4. Decisiones que salen de la investigación

| Decisión | Fundamento |
|----------|------------|
| **Estrella global obligatoria (1–5), ejes opcionales.** | Vivino/Delectable prueban que la estrella única es lo único que la gente completa siempre. Los ejes son para cuando hay ganas. |
| **Ejes fijos en código: gusto, aroma, cuerpo, precio/calidad.** | 4 ejes que un no-catador entiende. Configurables sería sobre-ingeniería y rompería la comparabilidad entre vinos. |
| **"Sin puntuar" es `NULL`, no `0`.** | Si `0` significa "no lo puntué" **y** "es horrible", los promedios mienten. Ver [02-data-model](02-data-model.md) §4. |
| **Foto de la etiqueta.** | Es el mecanismo de reconocimiento #1 en las 3 apps. En la góndola reconocés la etiqueta, no el nombre. |
| **Sin escaneo/OCR de etiqueta.** | Requiere un dataset de etiquetas o una API paga. Fuera de alcance; la foto manual cubre el 90% del valor. |
| **Sin precios ni inventario.** | No somos una bodega ni un comparador. El precio entra solo como percepción (`precio/calidad`). |
| **Sin feed social ni follows.** | Con ≤ decenas de usuarios, la lista de vinos **es** el feed. |

---

## 5. Vocabulario del dominio (usar en toda la UI)

Español rioplatense, términos que usa un consumidor, no un sommelier.

| Término | Significado en la app | No usar |
|---------|----------------------|---------|
| **Vino** | Una etiqueta concreta: nombre + bodega + cosecha. | "Producto", "ítem" |
| **Bodega** | Quien lo produce (Catena Zapata, Norton…). | "Winery", "productor" |
| **Uva / varietal** | Malbec, Cabernet Sauvignon… Un vino puede ser blend (varias). | "Cepa", "cultivar" |
| **Cosecha** | El año (2019). Opcional. | "Añada", "vintage" |
| **Tipo** | tinto · blanco · rosado · espumante · naranjo · dulce | "Estilo" |
| **Reseña** | Lo que **una** persona opinó de **un** vino. Una por persona por vino. | "Review", "cata", "nota de cata" |
| **Puntaje** | La estrella global 1–5. | "Score", "rating" |
| **Ejes** | Gusto, aroma, cuerpo, precio/calidad. Opcionales. | "Categorías", "atributos" |

---

## 6. Lo que explícitamente NO hacemos (anti-alcance)

Escrito para poder decir que no cuando aparezca la tentación:

- Escaneo de etiqueta / OCR / reconocimiento de imagen.
- Precios, tiendas, dónde comprar.
- Inventario de botellas, stock, "me quedan 3".
- Maridajes sugeridos, recomendador, ML.
- Feed social, follows, likes, comentarios en reseñas ajenas.
- Import/export desde Vivino o CellarTracker.
- App nativa. Es una **PWA instalable**; alcanza.

Si algo de esto se pide después, entra por la puerta de un issue, no por la ventana.
