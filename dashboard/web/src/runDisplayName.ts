/**
 * Display-only codenames for runs. The real `run_id` stays on the backend.
 * Names are picked deterministically from a fixed list (FNV-1a hash).
 *
 * List: major figures from Greek mythology (public-domain names).
 */

const RUN_CODENAMES: readonly string[] = [
  "Zeus",
  "Hera",
  "Poseidon",
  "Hades",
  "Athena",
  "Apollo",
  "Artemis",
  "Ares",
  "Aphrodite",
  "Hephaestus",
  "Hermes",
  "Demeter",
  "Dionysus",
  "Hestia",
  "Persephone",
  "Hecate",
  "Nike",
  "Eos",
  "Helios",
  "Selene",
  "Nyx",
  "Eris",
  "Nemesis",
  "Tyche",
  "Pan",
  "Asclepius",
  "Iris",
  "Hebe",
  "Ganymede",
  "Atlas",
  "Prometheus",
  "Epimetheus",
  "Oceanus",
  "Tethys",
  "Hyperion",
  "Theia",
  "Coeus",
  "Phoebe",
  "Cronus",
  "Rhea",
  "Mnemosyne",
  "Themis",
  "Metis",
  "Leto",
  "Eurynome",
  "Styx",
  "Charon",
  "Cerberus",
  "Hydra",
  "Chimera",
  "Medusa",
  "Pegasus",
  "Chiron",
  "Achilles",
  "Odysseus",
  "Perseus",
  "Heracles",
  "Theseus",
  "Jason",
  "Orpheus",
  "Bellerophon",
  "Atalanta",
  "Cadmus",
  "Oedipus",
  "Antigone",
  "Electra",
  "Clytemnestra",
  "Agamemnon",
  "Menelaus",
  "Helen",
  "Paris",
  "Hector",
  "Priam",
  "Andromache",
  "Aeneas",
  "Dido",
  "Penelope",
  "Telemachus",
  "Nestor",
  "Ajax",
  "Patroclus",
  "Hecuba",
  "Cassandra",
  "Tiresias",
  "Daedalus",
  "Icarus",
  "Minos",
  "Pasiphae",
  "Ariadne",
  "Phaethon",
  "Actaeon",
  "Adonis",
  "Psyche",
  "Eros",
  "Thanatos",
  "Hypnos",
  "Morpheus",
  "Aeolus",
  "Boreas",
  "Zephyrus",
  "Notus",
  "Eurus",
  "Pontus",
  "Gaia",
  "Uranus",
  "Chaos",
  "Erebus",
  "Aether",
  "Hemera",
  "Nereus",
  "Thaumas",
  "Phorcys",
  "Ceto",
  "Eurybia",
  "Scylla",
  "Charybdis",
  "Sirens",
  "Circe",
  "Calypso",
  "Nausicaa",
  "Arete",
  "Alcinous",
  "Pandora",
  "Deucalion",
  "Pyrrha",
  "Leda",
  "Castor",
  "Pollux",
  "Helen of Sparta",
  "Io",
  "Europa",
  "Callisto",
  "Semele",
  "Danae",
  "Cepheus",
  "Cassiopeia",
  "Cetus",
  "Phaethusa",
  "Lamia",
  "Empusa",
  "Midas",
  "Sisyphus",
  "Tantalus",
  "Ixion",
  "Tityos",
  "Orion",
  "Arachne",
  "Niobe",
  "Procne",
  "Philomela",
  "Tereus",
  "Pentheus",
  "Endymion",
  "Attis",
  "Cybele",
  "Rhea Silvia",
  "Romulus",
  "Remus"
];

/** Stable 32-bit FNV-1a hash of the backend run id. */
export function hashRunId(runId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < runId.length; i += 1) {
    hash ^= runId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** User-facing run label; same `run_id` always maps to the same codename. */
export function getRunDisplayName(runId: string): string {
  if (!runId) return "Unnamed run";
  const index = hashRunId(runId) % RUN_CODENAMES.length;
  return RUN_CODENAMES[index] ?? "Unnamed run";
}

export function normalizeMessageCount(count: number | null | undefined): number {
  if (count == null || Number.isNaN(Number(count))) return 0;
  return Math.max(0, Math.floor(Number(count)));
}

/** Compact message count for history rows, e.g. `0 msgs`, `1 msg`, `1,234 msgs`. */
export function formatMessageCount(count: number | null | undefined): string {
  const n = normalizeMessageCount(count);
  if (n === 0) return "0 msgs";
  if (n === 1) return "1 msg";
  return `${n.toLocaleString()} msgs`;
}
