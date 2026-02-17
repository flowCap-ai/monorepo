# Calculateur de Valeur Finale V2 LP - Guide Utilisateur Simple

## 🎯 Vue d'ensemble

Cette fonctionnalité vous permet de calculer facilement **V_final** (valeur finale) d'un investissement LP V2 sur PancakeSwap en fournissant simplement :
- Vos données d'entrée : montant initial, durée, variation de prix attendue
- Les données on-chain du pool : volume, liquidité, récompenses, etc.

**La fréquence de harvest (h) est optimisée automatiquement** pour maximiser V_final !

## 🚀 Utilisation Rapide

### Option 1 : Calculateur Interactif (Recommandé)

Lancez le calculateur interactif qui vous guide étape par étape :

```bash
npm run calc:final
```

Le script vous demandera :

**Entrées utilisateur :**
- `V_initial` : Investissement initial en USD
- `days` : Durée de l'investissement en jours
- `r` : Ratio de prix `r = P_final / P_initial`
  - `r = 1.0` : pas de changement de prix
  - `r = 1.25` : +25% de hausse (risque d'IL)
  - `r = 0.8` : -20% de baisse (risque d'IL)

**Données on-chain :**
- `V_24h` : Volume de trading sur 24h (USD)
- `TVL_lp` : Liquidité totale du pool (USD)
- `w_pair_ratio` : Poids du pool dans les récompenses (0-1)
- `P_cake` : Prix du CAKE (USD)
- `TVL_stack` : TVL stakée pour les récompenses (USD)
- `P_gas` : Prix du gas (Gwei)
- `P_BNB` : Prix du BNB (USD)

**Résultat :**
```
V_final = $10,195.80

Additional Info:
  Initial investment: $10,000.00
  Final value:        $10,195.80
  Total return:       $195.80 (1.96%)
  Annualized APY:     7.94%
  Period:             90 days
  Price ratio (r):    1.25
  Impermanent Loss:   -0.62%
```

### Option 2 : Test Rapide avec Valeurs Par Défaut

Pour voir des exemples avec 3 scénarios réalistes :

```bash
npm run quick:final
```

Affiche :
- **Scenario 1** : Pool stable (WBNB-BUSD), 30 jours, r=1.0
- **Scenario 2** : Pool volatile (ETH-BNB), 90 jours, r=1.25 (+25%)
- **Scenario 3** : Pool faible liquidité (ALT-BUSD), 60 jours, r=0.9 (-10%)

### Option 3 : Intégration dans Votre Code

```typescript
import { calculateOptimizedFinalValue } from './agents/skills/analyzePool-LPV2.js';

// Entrées utilisateur
const userInputs = {
  V_initial: 10000,  // $10,000
  days: 90,          // 90 jours
  r: 1.25            // +25% de hausse
};

// Données on-chain (à récupérer via APIs)
const onChainData = {
  V_24h: 8_000_000,     // Volume 24h
  TVL_lp: 60_000_000,   // Liquidité pool
  w_pair_ratio: 0.08,   // 8% des émissions
  P_cake: 2.5,          // $2.50 CAKE
  TVL_stack: 50_000_000,// TVL stakée
  P_gas: 3,             // 3 Gwei
  P_BNB: 600            // $600 BNB
};

// Calcul direct
const V_final = calculateOptimizedFinalValue(userInputs, onChainData);

console.log(`Valeur finale : $${V_final.toFixed(2)}`);
```

## 📊 Comprendre le Ratio de Prix (r)

Le paramètre `r` représente la variation de prix attendue entre les deux tokens du pool :

### Formule
```
r = P_final / P_initial
```

Où :
- `P_final` : Prix relatif attendu en fin de période
- `P_initial` : Prix relatif actuel (normalisé à 1)

### Exemples Pratiques

#### Pool ETH-BUSD, prix ETH actuel = $3,000

| Scénario | Prix final ETH | Calcul | r | Impact IL |
|----------|---------------|--------|---|-----------|
| Aucun changement | $3,000 | 3000/3000 | 1.0 | 0% |
| ETH +10% | $3,300 | 3300/3000 | 1.1 | -0.23% |
| ETH +25% | $3,750 | 3750/3000 | 1.25 | -0.62% |
| ETH +50% | $4,500 | 4500/3000 | 1.5 | -2.02% |
| ETH -10% | $2,700 | 2700/3000 | 0.9 | -0.14% |
| ETH -25% | $2,250 | 2250/3000 | 0.75 | -0.85% |

### Impermanent Loss (IL)

La perte impermanente dépend de `r` selon la formule :

```
IL_factor = (2 × √r) / (1 + r)
```

**Plus `r` s'éloigne de 1.0, plus l'IL augmente.**

```
r = 1.0  → IL = 0.00%  (pas de changement)
r = 1.1  → IL = -0.23% (faible variation)
r = 1.25 → IL = -0.62% (variation modérée)
r = 1.5  → IL = -2.02% (forte variation)
r = 2.0  → IL = -5.72% (doublement du prix)
```

## 🔧 Optimisation Automatique de h

La fonction teste **10 fréquences de harvest différentes** :

| Fréquence | h (heures) | Période |
|-----------|-----------|---------|
| Très haute | 1 | Toutes les heures |
| Haute | 2, 4, 6, 8 | Plusieurs fois par jour |
| Moyenne | 12, 24 | 1-2 fois par jour |
| Basse | 48, 72 | Tous les 2-3 jours |
| Très basse | 168 | Hebdomadaire |

**Pour chaque fréquence :**
1. Calcule les coûts de gas totaux
2. Calcule le compounding avec cette fréquence
3. Calcule V_final = rendement - coûts gas
4. Retient la fréquence qui donne le meilleur V_final

**Résultat :** Vous obtenez automatiquement le V_final optimal sans devoir choisir h manuellement.

## 📈 Formule Complète

La valeur finale est calculée ainsi :

```
V_final = V_initial × IL_factor × (1 + r_harvest)^n - gas_costs
```

Où :
- `IL_factor = (2√r) / (1+r)` : Facteur de perte impermanente
- `r_harvest = (APY_total / 100 / 365) × (h/24)` : Taux par harvest
- `n = days / (h/24)` : Nombre de harvests
- `APY_total = APY_fees + APY_farming` : Rendement annuel total
- `gas_costs` : Coûts des transactions de harvest

### Décomposition des APY

**Trading Fees APY :**
```
APY_fees = (V_24h × 0.0017 × 365 / TVL_lp) × 100
```

**Farming Rewards APY :**
```
APY_farming = (14500 × 365 × w_pair_ratio × P_cake / TVL_stack) × 100
```

**Note :** Les émissions PancakeSwap V2 sont de **14,500 CAKE/jour** (5,292,500/an).

## 🎓 Exemples d'Utilisation

### Exemple 1 : Pool Stable, Court Terme

**Contexte :** WBNB-BUSD, investissement de $10,000 sur 30 jours, pas de variation de prix attendue.

```bash
npm run calc:final
```

```
V_initial: 10000
Days: 30
r: 1.0
V_24h: 5000000
TVL_lp: 50000000
w_pair_ratio: 0.05
P_cake: 2.5
TVL_stack: 40000000
P_gas: 3
P_BNB: 600

→ V_final = $10,064.75
→ Total Return: +0.65% en 30 jours (~7.9% APY)
```

### Exemple 2 : Pool Volatile, Moyen Terme

**Contexte :** ETH-BNB, investissement de $10,000 sur 90 jours, hausse de +25% attendue.

```
V_initial: 10000
Days: 90
r: 1.25
V_24h: 8000000
TVL_lp: 60000000
w_pair_ratio: 0.08
P_cake: 2.5
TVL_stack: 50000000
P_gas: 3
P_BNB: 600

→ V_final = $10,195.80
→ Total Return: +1.96% en 90 jours (~7.9% APY)
→ Impermanent Loss: -0.62% (compensée par les rendements)
```

### Exemple 3 : Pool Faible Liquidité, Haut Rendement

**Contexte :** ALT-BUSD, investissement de $5,000 sur 60 jours, baisse de -10%.

```
V_initial: 5000
Days: 60
r: 0.9
V_24h: 200000
TVL_lp: 2000000
w_pair_ratio: 0.01
P_cake: 2.5
TVL_stack: 1500000
P_gas: 3
P_BNB: 600

→ V_final = $5,117.47
→ Total Return: +2.35% en 60 jours (~14.3% APY)
→ Impermanent Loss: -0.14%
```

## 🆚 Comparaison avec Autres Fonctions

| Fonction | Entrées | Sortie | Usage |
|----------|---------|--------|-------|
| `calculateOptimizedFinalValue()` | User inputs + On-chain data | **V_final (nombre)** | **Simple et rapide** ✅ |
| `optimizeAndAnalyzeLPPosition()` | PoolData + days + r | Objet complet avec métriques | Analyse détaillée |
| `analyzeLPV2Position()` | PoolData + h | Full breakdown | Debug et exploration |

**Recommandation :** Utilisez `calculateOptimizedFinalValue()` pour obtenir rapidement le résultat final.

## 📁 Fichiers du Projet

```
monorepo/
├── agents/skills/
│   └── analyzePool-LPV2.ts          # Fonction calculateOptimizedFinalValue()
├── scripts/
│   ├── calculate-final-value.ts      # Calculateur interactif
│   ├── quick-test-final-value.ts     # Test rapide avec 3 scénarios
│   ├── test-lpv2-analysis.ts         # Suite de tests complète
│   └── example-simple-usage.ts       # Exemples d'utilisation détaillés
└── package.json                      # Scripts npm
```

## 🛠 Scripts Disponibles

| Commande | Description |
|----------|-------------|
| `npm run calc:final` | Calculateur interactif (recommandé) |
| `npm run quick:final` | Test rapide avec 3 scénarios |
| `npm run example:lpv2` | Exemples détaillés avec full analysis |
| `npm run test:lpv2` | Suite de tests complète |

## ❓ FAQ

### Q1 : Comment obtenir les données on-chain ?

**Réponse :** Utilisez les APIs suivantes :
- **DeFiLlama** : `V_24h`, `TVL_lp`, `TVL_stack`, `w_pair_ratio`
- **CoinGecko** : `P_cake`, `P_BNB`
- **BSCScan** : `P_gas` (gas price)

### Q2 : Pourquoi h est-il optimisé automatiquement ?

**Réponse :** La fréquence optimale dépend du rendement et des coûts de gas. Un harvest trop fréquent augmente les frais, un harvest trop rare réduit le compounding. La fonction teste 10 fréquences et choisit la meilleure.

### Q3 : Que se passe-t-il si r change pendant la période ?

**Réponse :** Le modèle suppose que la variation totale est `r`. Si le prix fluctue pendant la période mais termine à `r`, l'IL sera calculée sur la base de `r` final. Pour des prédictions plus précises, divisez en plusieurs périodes.

### Q4 : Comment interpréter un V_final négatif ?

**Réponse :** Si V_final < V_initial, cela signifie que les pertes (IL + gas) dépassent les gains (fees + farming). Cela peut arriver avec :
- Forte IL (r très éloigné de 1.0)
- Faible volume de trading (peu de fees)
- Faibles récompenses farming
- Gas très élevé

### Q5 : Puis-je comparer plusieurs pools ?

**Réponse :** Oui ! Appelez `calculateOptimizedFinalValue()` pour chaque pool avec les mêmes `V_initial` et `days`, puis comparez les V_final.

```typescript
const pools = [poolA_data, poolB_data, poolC_data];
const results = pools.map(data => ({
  name: data.name,
  V_final: calculateOptimizedFinalValue(userInputs, data)
}));

// Tri par V_final décroissant
results.sort((a, b) => b.V_final - a.V_final);
console.log('Meilleur pool:', results[0].name);
```

## 🎯 Cas d'Usage Recommandés

### ✅ Bon Usage

- Comparer rapidement plusieurs pools
- Calculer le ROI d'un investissement LP
- Estimer l'impact de l'IL sur le rendement net
- Trouver la meilleure opportunité de yield

### ⚠️ Limitations

- Ne gère pas les variations de prix intra-période
- Suppose des APY constants (dans la réalité ils fluctuent)
- Ne prend pas en compte les événements extraordinaires (hacks, depeg, etc.)
- Basé sur des données historiques (past performance ≠ future results)

## 📚 Pour Aller Plus Loin

- **Documentation complète** : [LPV2-ANALYSIS.md](../docs/LPV2-ANALYSIS.md)
- **Guide utilisateur original** : [GUIDE_UTILISATEUR_SIMPLE.md](../docs/GUIDE_UTILISATEUR_SIMPLE.md)
- **Résumé implémentation** : [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md)
- **Code source** : [analyzePool-LPV2.ts](../agents/skills/analyzePool-LPV2.ts)

## 🤝 Support

Pour toute question ou suggestion :
1. Consulter la documentation complète
2. Examiner les exemples dans `scripts/`
3. Lancer les tests : `npm run test:lpv2`

---

**Dernière mise à jour :** 2024
**Version :** 1.0.0
**Auteur :** FlowCap Team
