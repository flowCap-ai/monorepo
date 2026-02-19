SÉCURITÉ (Critique)
# Sévérité Problème Fichier
S1 CRITIQUE La session key privée est envoyée en clair au serveur via /api/delegate — ça contredit le modèle non-custodial route.ts
S2 CRITIQUE encryption.ts est vide — les session keys sont stockées en clair dans localStorage encryption.ts
S3 CRITIQUE SessionValidator.sol est vide — aucune validation on-chain des permissions SessionValidator.sol
S4 CRITIQUE encodeEnableSessionKey() retourne '0x' — la délégation n'est jamais enregistrée on-chain biconomyClient.ts
S5 CRITIQUE /api/skills/[skillName] permet l'exécution arbitraire de méthodes avec arguments non validés — injection de code dashboard/app/api/skills/[skillName]/route.ts
S6 ÉLEVÉ Aucune authentification sur les 3 routes API (/api/delegate, /api/agent, /api/skills) Toutes les routes
S7 ÉLEVÉ isValid() dans SessionKeyManager recalcule validUntil à chaque appel → la session n'expire jamais session-key-manager.ts
S8 ÉLEVÉ blockedFunctions (transfer, transferFrom) est défini dans config.yaml mais jamais vérifié dans le code config.yaml
S9 MOYEN Nonce UserOp hardcodée à BigInt(0) — impossible d'envoyer plus d'une transaction execSwap.ts

FONCTIONNALITÉ
# Priorité Proposition
F1 P0 Implémenter l'exécution réelle — l'agent identifie les opportunités mais ne les exécute jamais (TODO dans le code)
F2 P0 Hash EIP-4337 correct + récupération de nonce depuis l'EntryPoint — actuellement un stub qui sera rejeté par tout bundler
F3 P1 Suivi des positions — currentPositions n'est jamais rempli après un supply/LP, donc l'agent ne connaît pas l'état réel du portefeuille
F4 P1 Prix BNB dynamique — hardcodé à $600, devrait venir d'un oracle (Chainlink) ou API
F5 P1 Notifications Telegram — déclarées dans config.yaml mais jamais implémentées
F6 P2 Le Service Worker ne peut pas scanner quand le tab est fermé — il délègue fetchPoolData au main thread
F7 P2 Graceful shutdown — les boucles while(true) n'ont pas de signal handlers (SIGTERM, SIGINT)

UX / INTERFACE
# Priorité Proposition
U1 P0 Historique de transactions — TxHistory.tsx est vide. Ajouter un tableau des opérations de l'agent (date, type, montant, tx hash clickable vers BscScan)
U2 P1 Vue portefeuille — Dashboard avec positions actuelles, APY en cours, P&L depuis la délégation, graphique d'évolution
U3 P1 Indicateur d'expiration de session — Ajouter un countdown dans le panneau de monitoring (soul.md mentionne un warning 24h avant)
U4 P1 Bouton "Révoquer Session" avec confirmation modale et révocation on-chain (pas juste un localStorage.clear)
U5 P2 Notifications in-app — Toast quand l'agent trouve/exécute une opportunité (actuellement seulement console.log)
U6 P2 Mode "Simulation" — Permettre à l'utilisateur de voir ce que l'agent ferait sans déléguer de vrais fonds (dry-run)
U7 P2 Responsive mobile — Le dashboard est fonctionnel mais les cards de profil de risque et le panel de monitoring pourraient être mieux adaptés aux petits écrans
U8 P3 Dark/Light mode — Actuellement uniquement dark, ajouter un toggle