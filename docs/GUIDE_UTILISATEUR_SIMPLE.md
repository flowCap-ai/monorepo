# Guide Utilisateur Simplifié - Analyse LP V2

## 🎯 Interface Simplifiée

Vous voulez simplement savoir : **"Devrais-je investir dans ce pool ?"**

Utilisez la fonction `optimizeAndAnalyzeLPPosition()` qui :
1. ✅ Optimise automatiquement la fréquence de harvest (`h`)
2. ✅ Calcule le rendement sur votre période
3. ✅ Prend en compte le changement de prix (`r`)
4. ✅ Vous donne une recommandation claire

---

## 🚀 Utilisation Simple

```typescript
import { optimizeAndAnalyzeLPPosition } from './agents/skills/analyzePool-LPV2.js';

// Vos 3 paramètres simples :
const result = await optimizeAndAnalyzeLPPosition(
  poolData,    // Données du pool
  30,          // Période d'investissement (jours)
  1.0          // Ratio de prix r = P_final / P_initial (1.0 = pas de changement)
);

// Résultats clairs :
console.log(`Rendement : ${result.totalReturnPercent}%`);
console.log(`Profit net : $${result.netProfit}`);
console.log(`Harvester tous les : ${result.optimalHarvestFrequencyHours}h`);
console.log(`Recommandation : ${result.recommendedAction}`);
```

---

## 📋 Paramètres d'Entrée

### 1. `poolData` : Données du pool
Obtenu via `getPoolData.ts` avec les paramètres exogènes :
- `V_initial` : Votre investissement (USD)
- `V_24h` : Volume 24h du pool (USD)  
- `TVL_lp` : Liquidité totale (USD)
- `w_pair_ratio` : Poids du pool (0-1)
- `P_cake` : Prix CAKE (USD)
- `TVL_stack` : TVL stakée (USD)
- `P_gas` : Prix du gas (Gwei)
- `P_BNB` : Prix BNB (USD)

### 2. `days` : Période d'investissement
Combien de jours comptez-vous garder la position ?
- Exemple : `7` pour 1 semaine, `30` pour 1 mois, `90` pour 3 mois

### 3. `priceRatio` : Ratio de prix attendu
**r = P_final / P_initial**

Exemples :
- `1.0` = Pas de changement de prix (stablecoin pair)
- `1.1` = Prix augmente de 10%
- `0.9` = Prix baisse de 10%
- `1.25` = Prix augmente de 25%
- `0.75` = Prix baisse de 25%
- `2.0` = Prix double

---

## 📊 Résultats Retournés

### Stratégie Optimisée
```typescript
result.optimalHarvestFrequencyHours  // Ex: 24 (harvester tous les jours)
result.numberOfHarvests              // Ex: 30 (30 harvests en 30 jours)
```

### Rendements
```typescript
result.finalValue            // $1,023.45 (valeur finale)
result.totalReturn           // $23.45 (gain brut)
result.totalReturnPercent    // 2.35% (rendement %)
result.annualizedAPY         // 28.74% (APY annualisé)
result.netProfit             // $23.33 (profit après gas)
```

### Décomposition
```typescript
result.tradingFeeIncome      // $12.00 (revenus des fees)
result.farmingRewardIncome   // $11.50 (récompenses farming)
result.impermanentLoss       // -0.5% (perte impermanente)
result.totalGasCost          // $0.12 (coûts gas)
```

### Évaluation du Risque
```typescript
result.riskLevel             // 'low' | 'medium' | 'high' | 'critical'
result.riskScore             // 85 (sur 100)
result.isProfitable          // true | false
result.recommendedAction     // 'ENTER' | 'CONSIDER' | 'AVOID'
result.warnings              // ['Low TVL...', ...]
```

---

## 💡 Exemples d'Utilisation

### Exemple 1 : Position Simple

```typescript
// Pool USDT-BUSD (stable)
const result = await optimizeAndAnalyzeLPPosition(poolData, 30, 1.0);

if (result.recommendedAction === 'ENTER') {
  console.log(`✅ Investissez ! APY: ${result.annualizedAPY}%`);
  console.log(`Harvester tous les ${result.optimalHarvestFrequencyHours}h`);
} else {
  console.log(`❌ Ne pas investir: ${result.warnings.join(', ')}`);
}
```

### Exemple 2 : Comparer Plusieurs Scénarios

```typescript
import { compareScenarios } from './agents/skills/analyzePool-LPV2.js';

const scenarios = [
  { days: 7, priceRatio: 1.0, label: '7 jours, stable' },
  { days: 30, priceRatio: 1.0, label: '30 jours, stable' },
  { days: 30, priceRatio: 1.25, label: '30 jours, +25%' },
  { days: 30, priceRatio: 0.75, label: '30 jours, -25%' },
];

const results = await compareScenarios(poolData, scenarios);

// Trouver le meilleur scénario
const best = results.reduce((a, b) => a.netProfit > b.netProfit ? a : b);
console.log(`Meilleur scénario: ${best.label} avec $${best.netProfit} profit`);
```

### Exemple 3 : Vérification Rapide

```typescript
// Juste savoir si c'est rentable
const result = await optimizeAndAnalyzeLPPosition(poolData, 30, 1.0);

console.log(`Profitable? ${result.isProfitable ? 'OUI' : 'NON'}`);
console.log(`Profit net: $${result.netProfit}`);
console.log(`Risque: ${result.riskLevel}`);
```

---

## 🎬 Actions Recommandées

### 'ENTER' ✅
**Investissez !**
- Risque faible
- APY > 15%
- Profitable après gas

### 'CONSIDER' ⚠️
**À considérer**
- Risque moyen
- APY > 10%
- Revoyez les warnings

### 'AVOID' ❌
**Ne pas investir**
- Risque élevé
- APY trop faible
- Pas profitable

---

## 📈 Comprendre le Ratio de Prix `r`

Le ratio `r = P_final / P_initial` mesure le changement de prix d'un token par rapport à l'autre.

### Pour une paire BNB-USDT :
- **r = 1.0** : BNB reste à $600 → pas d'IL
- **r = 1.2** : BNB monte à $720 (+20%) → IL de -1.7%
- **r = 0.8** : BNB baisse à $480 (-20%) → IL de -1.7%
- **r = 2.0** : BNB double à $1200 → IL de -5.7%
- **r = 0.5** : BNB divise par 2 à $300 → IL de -5.7%

### Pour une paire stable (USDT-BUSD) :
- **r ≈ 1.0** toujours → IL négligeable (~0%)

**Important** : Plus `r` s'éloigne de 1.0, plus l'IL est importante !

---

## 🧮 Formule Complète (Pour Référence)

```
V_final = V_initial × IL_factor × (1 + r_harvest)^n - gas_costs

où :
- IL_factor = (2√r) / (1+r)
- r_harvest = APY_total / 100 / 365 × (h/24)
- n = days / (h/24)
- APY_total = APY_fees + APY_farming
```

Mais **vous n'avez pas besoin de calculer ça** ! La fonction le fait pour vous.

---

## 🛠️ Lancer les Exemples

```bash
# Installer les dépendances
npm install

# Lancer l'exemple complet
npm run example:lpv2

# Ou directement
tsx scripts/example-simple-usage.ts
```

Cela affiche 3 exemples :
1. Analyse simple d'une position
2. Comparaison de scénarios
3. Vérification rapide de rentabilité

---

## 📚 Documentation Complète

- **Guide détaillé** : `docs/LPV2-ANALYSIS.md`
- **Référence rapide** : `docs/QUICK_REFERENCE.md`
- **Tests complets** : `scripts/test-lpv2-analysis.ts`
- **Implémentation** : `agents/skills/analyzePool-LPV2.ts`

---

## ❓ FAQ

### Q: Comment obtenir les données d'un pool ?
```typescript
import { getAllPoolData } from './agents/skills/getPoolData.js';
const pools = await getAllPoolData(1000); // $1000 investment
const myPool = pools.find(p => p.poolId === 'pancakeswap-usdt-busd');
```

### Q: Quelle période choisir ?
- **Court terme (7-14 jours)** : Si vous voulez tester ou sortir vite
- **Moyen terme (30-60 jours)** : Équilibre rendement/flexibilité
- **Long terme (90+ jours)** : Maximise les rendements composés

### Q: Comment estimer le ratio de prix `r` ?
Pour une paire X-Y :
1. **Pair stable** : r ≈ 1.0
2. **Pair corrélée** (BNB-ETH) : r ≈ 0.9-1.1
3. **Pair volatile** (TOKEN-BUSD) : testez plusieurs scénarios

Utilisez `compareScenarios()` pour tester différentes valeurs !

### Q: La fonction optimise-t-elle vraiment `h` ?
Oui ! Elle teste automatiquement 10 fréquences différentes (1h, 2h, 4h, 6h, 8h, 12h, 24h, 48h, 72h, 168h) et choisit celle qui maximise le profit net.

### Q: Que signifie "harvester" ?
Collecter les récompenses et les réinvestir (compound). Plus fréquent = meilleurs rendements, mais plus de gas.

---

## 🎯 Cas d'Usage Typiques

### 1. Agent Autonome
```typescript
// Scanne tous les pools, trouve les meilleures opportunités
const pools = await getAllPoolData(1000);

for (const pool of pools) {
  const analysis = await optimizeAndAnalyzeLPPosition(pool, 30, 1.0);
  
  if (analysis.recommendedAction === 'ENTER' && 
      analysis.annualizedAPY > 20) {
    console.log(`🎯 Opportunité trouvée: ${pool.name}`);
    console.log(`   APY: ${analysis.annualizedAPY}%`);
    console.log(`   Profit 30j: $${analysis.netProfit}`);
    // Exécuter la transaction...
  }
}
```

### 2. Dashboard Utilisateur
```typescript
// Affiche plusieurs options à l'utilisateur
const scenarios = [
  { days: 7, priceRatio: 1.0 },
  { days: 30, priceRatio: 1.0 },
  { days: 90, priceRatio: 1.0 },
];

const options = await compareScenarios(userPool, scenarios);
// Afficher dans UI: tableaux de comparaison
```

### 3. Alerte de Sortie
```typescript
// Vérifie si la position est toujours rentable
const currentAnalysis = await optimizeAndAnalyzeLPPosition(
  currentPool, 
  remainingDays, 
  estimatedPriceRatio
);

if (currentAnalysis.recommendedAction === 'AVOID') {
  alert('⚠️ Position plus rentable ! Envisager de sortir.');
}
```

---

**Créé par HashFox Labs pour FlowCap**
