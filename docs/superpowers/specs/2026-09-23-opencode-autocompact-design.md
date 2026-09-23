# opencode-autocompact — design

fecha: 2026-09-23
estado: propuesta pendiente de revisión

## 1. intención

dar control TUI a `compaction.*` existente (`auto`, `keep.tokens`, `buffer`)
sin editar JSON a mano. alcance: solo `/autocompact`. `/compact` nativo
ya existe y no se toca.

éxito: ver estado, prender/apagar auto, ajustar keep/buffer, ver % en
footer, con persistencia en `opencode.json(c)` + reload.

## 2. contrato UX

- `/autocompact` → estado efectivo: `auto`, `keep.tokens`, `buffer`,
  % uso, umbral `input limit - buffer`, último checkpoint.
- `/autocompact on|off` → toggle con toast de confirmación.
- `/autocompact keep <n> | buffer <n>` → ajuste validado (enteros ≥ 0;
  aviso si `keep` deja sin margen o `buffer` adelanta el trigger).
- `/autocompact status` → alias del estado.
- footer `prompt.footer.status` → `auto:on 62%`, tono cambia cerca del techo.
- fase 2 (fuera de este slice): aviso pre-trigger y resumen post-compactación.

## 3. arquitectura

- repo: `~/Proyectos/opencode-autocompact/`, alta por path absoluto en el
  array `plugins` del `opencode.json` global.
- `src/index.ts`: stub server (id `autocompact.server`), reserva para
  persistencia futura.
- `src/tui.tsx`: plugin TUI (id `autocompact.cli`): slash vía
  `keymap.layer`, estado vía `storage.store`, footer vía `ui.slot`,
  avisos vía `ui.toast` / `ui.dialog`.
- `src/autocompact/config.ts`: lee/escribe `compaction.*` + reload.
- `src/autocompact/status.ts`: % uso y umbral, lógica pura y testeable.
- `package.json` expone `"."` y `"./tui"`.

## 4. flujo de datos

slash → config.ts (lee efectivo vía client) → mutación validada →
escritura `opencode.json(c)` + reload → toast + footer se re-renderiza.
status.ts solo calcula, nunca muta.

## 5. errores

- escritura inválida (n negativo, no entero) → dialog de error, sin mutar.
- reload falla → toast con causa, config en disco queda y se reintenta.
- sin modelo resoluble o sin historial comprimible (límites de compaction)
  → toast informativo, sin reintento ciego.
- verificación abierta: endpoint exacto TUI→escritura config + reload
  sin reiniciar sesión; confirmar contra docs V2 antes de implementar.

## 6. testing

- `tests/status.test.ts`: cálculo de umbral y % (vitest, sin TUI).
- verificación manual: `/autocompact status`, toggle on/off con toast,
  footer visible, persistencia tras `opencode service restart`.

## 7. fases

- fase 1 (este spec): estado, on/off, keep/buffer, footer.
- fase 2: aviso pre-trigger en breakpoints, resumen post-checkpoint.
