# Guide Utilisateur - Calculateur avec Données On-Chain Automatiques

## 🎯 Vue d'Ensemble

Ce calculateur **récupère automatiquement les données réelles** des pools PancakeSwap depuis les APIs DeFiLlama et DexScreener. Vous n'avez plus besoin d'aller chercher manuellement les volumes, liquidités, prix des tokens, etc.

## 🚀 Utilisation

### Commande
```bash
npm run calc:onchain
```

### Durée
- **Premier lancement** : 30-60 secondes (récupération des données)
- **Sélection d'une pool** : Instantané

## 📋 Processus Étape par Étape

### ÉTAPE 1 : Récupération Automatique des Pools

Le script se connecte automatiquement aux APIs et récupère :
- ✅ Toutes les pools PancakeSwap V2 et V3
- ✅ Volumes 24h réels
- ✅ Liquidités (TVL)
- ✅ Prix CAKE et BNB actuels
- ✅ Prix du gas actuel
- ✅ Données de farming/staking

```
⏳ Fetching PancakeSwap pools from DeFiLlama and DexScreener...
   (This may take 30-60 seconds due to API rate limits)

✅ Found 156 pools!
```

### ÉTAPE 2 : Sélection d'une Pool

Le script affiche les **top 20 pools par liquidité** :

```
Top 20 pools by liquidity:

# | Pool Name                           | TVL         | 24h Volume  | Ver
--|-------------------------------------|-------------|-------------|----
1 | WBNB-BUSD (V2)                      | $45.2M      | $8.3M       | v2
2 | USDT-BUSD (V2)                      | $39.1M      | $19.4M      | v2
3 | ETH-WBNB (V2)                       | $28.7M      | $12.1M      | v2
4 | BTCB-WBNB (V2)                      | $22.4M      | $5.6M       | v2
...

Select pool number (1-20): 2
```

### ÉTAPE 3 : Affichage des Données On-Chain

Une fois la pool sélectionnée, le script affiche **toutes les données récupérées automatiquement** :

```
═══════════════════════════════════════════════════════════════
STEP 3: On-Chain Data (automatically fetched)
═══════════════════════════════════════════════════════════════

LP Pool Data:
  24h Volume (V_24h):      $19,400,000
  Pool Liquidity (TVL_lp): $39,000,000
  Volume/TVL Ratio:        49.74%

Farming/Staking Data:
  Pool Weight (w_pair_ratio): 5.20%
  CAKE Price (P_cake):     $2.48
  Staked TVL (TVL_stack):  $38,500,000

Gas & Token Prices:
  Gas Price (P_gas):       3.2 Gwei
  BNB Price (P_BNB):       $618.00
```

**Vous n'avez RIEN eu à entrer manuellement !** 🎉

### ÉTAPE 4 : Entrées Utilisateur

Le script demande **UNIQUEMENT** :
- `V_initial` : Votre investissement (USD)
- `days` : Durée de l'investissement (jours)
- `r` : Ratio de prix attendu (P_final / P_initial)

```
═══════════════════════════════════════════════════════════════
STEP 4: User Inputs
═══════════════════════════════════════════════════════════════

Initial investment V_initial (USD): 1000
Investment period (days): 90
Price ratio r = P_final / P_initial: 1.1
```

### ÉTAPE 5 : Calcul Automatique

Le script :
1. **Optimise automatiquement** la fréquence de harvest (h)
2. Teste 10 fréquences différentes (1h, 2h, 4h, 6h, 8h, 12h, 24h, 48h, 72h, 168h)
3. Sélectionne celle qui maximise V_final

```
⏳ Optimizing harvest frequency (testing 10 different frequencies)...
```

### ÉTAPE 6 : Résultats

```
═══════════════════════════════════════════════════════════════
RESULTS
═══════════════════════════════════════════════════════════════

💰 V_final = $1,087.32

Performance:
  Initial investment:     $1,000.00
  Final value:            $1,087.32
  Total return:           $87.32 (8.73%)
  Annualized APY:         35.41%
  Period:                 90 days

Price Impact:
  Price ratio (r):        1.1
  Impermanent Loss:       -0.23%

Pool Info:
  Pool:                   USDT-BUSD (V2)
  Version:                v2
  Farming rewards:        Included

✅ Calculation complete!
```

## 🆚 Comparaison avec le Calculateur Manuel

| Critère | calc:onchain (Auto) | calc:final (Manuel) |
|---------|---------------------|---------------------|
| **Données sources** | APIs temps réel | Entrée manuelle |
| **Paramètres à entrer** | 3 (V_initial, days, r) | 9 (tous) |
| **Temps de setup** | 60 sec (1ère fois) | 2 min |
| **Précision** | Données réelles | Dépend de l'utilisateur |
| **Mise à jour** | Automatique | Manuelle |
| **Farming detection** | Automatique | Question posée |
| **Optimisation h** | ✅ Oui | ✅ Oui |
| **Choix de pool** | Liste top 20 | Aucune aide |

## 💡 Cas d'Usage Recommandés

### ✅ Utilisez `calc:onchain` quand :
- Vous voulez analyser des pools PancakeSwap **réelles**
- Vous voulez des données **à jour** (prix, volumes, liquidités)
- Vous voulez **comparer rapidement** plusieurs pools
- Vous ne voulez **pas chercher** les données manuellement
- Vous voulez être sûr que les données sont **cohérentes**

### ⚠️ Utilisez `calc:final` (manuel) quand :
- Vous voulez tester des **scénarios hypothétiques**
- Vous avez des **données futures** ou projections
- Vous voulez des pools **non-PancakeSwap**
- Vous êtes **offline** sans accès aux APIs

## 🔍 Comprendre les Données Affichées

### Volume/TVL Ratio
```
Volume/TVL Ratio: 49.74%
```
- **Faible** (< 10%) : Pool peu active, fees faibles
- **Normale** (10-30%) : Pool standard
- **Élevée** (30-50%) : Pool très active, fees élevées 🔥
- **Très élevée** (> 50%) : Vérifier données, possibles arbitrages

### Pool Weight (w_pair_ratio)
```
Pool Weight: 5.20%
```
- Part des émissions CAKE allouées à cette pool
- Plus élevé = plus de rewards farming
- Typiquement 1-10% pour les pools principales

### Farming Rewards Detection
```
Farming/Staking Data:
  ⚠️  No staking data available for this pool.
```
OU
```
Farming/Staking Data:
  Pool Weight: 5.20%
  CAKE Price: $2.48
  Staked TVL: $38,500,000
```

Le script **détecte automatiquement** si la pool a des rewards de farming.

## 📊 Exemple Complet

### Scénario : Investir $5,000 dans WBNB-BUSD pour 180 jours

```bash
npm run calc:onchain
```

**1. Sélection de la pool :**
```
Select pool number (1-20): 1
✅ Selected: WBNB-BUSD (V2)
```

**2. Données récupérées automatiquement :**
```
24h Volume:     $8,300,000
Pool Liquidity: $45,200,000
Volume/TVL:     18.36%
CAKE Price:     $2.48
Gas Price:      3.2 Gwei
BNB Price:      $618
```

**3. Vos entrées :**
```
V_initial: 5000
days: 180
r: 1.0 (pas de changement de prix attendu)
```

**4. Résultat :**
```
V_final = $5,453.21
Total return: $453.21 (9.06%)
Annualized APY: 18.38%
```

**Interprétation :**
- Avec $5,000 investis pendant 6 mois
- Dans une pool stable (WBNB-BUSD)
- Sans changement de prix (r=1.0)
- Vous gagnez **$453 (9%)** en 6 mois
- Soit **18% APY** annualisé

## ⚡ Astuces et Conseils

### 1. **Première exécution lente**
La première fois prend 30-60 secondes car le script doit récupérer toutes les pools. C'est normal.

### 2. **Choisir la bonne pool**
- **Stablecoins** (USDT-BUSD) : Peu d'IL, volumes élevés ✅
- **Major pairs** (WBNB-BUSD) : Bon équilibre
- **Volatile pairs** (ETH-WBNB) : IL possible mais farming intéressant

### 3. **Interpréter Volume/TVL > 30%**
Si une pool a un ratio > 30%, vérifiez :
- Les données sont-elles correctes ?
- Y a-t-il un événement spécial (listing, delisting) ?
- Est-ce durable ou temporaire ?

### 4. **Comparer plusieurs pools**
Relancez simplement le script et sélectionnez une autre pool. Les données sont déjà en cache.

### 5. **Vérifier les warnings**
```
⚠️  Warning: Expected negative returns.
```
→ Changez de pool ou augmentez la durée

```
🔥 High APY detected!
```
→ Vérifiez les données, c'est peut-être trop beau

## 🐛 Dépannage

### "No pools found"
- Vérifiez votre connexion internet
- Les APIs DeFiLlama/DexScreener sont peut-être down
- Réessayez dans quelques minutes

### "Failed to fetch"
- Rate limiting des APIs
- Attendez 1-2 minutes et relancez

### "Invalid pool number"
- Entrez un nombre entre 1 et 20
- Ne mettez pas de virgule ou point

### Données semblent incorrectes
- Les APIs peuvent avoir un délai
- Vérifiez sur PancakeSwap Info pour comparer
- Utilisez `calc:final` si vous avez des données plus précises

## 📚 Pour Aller Plus Loin

- **Script de debug** : `npm run debug:calc` - Voir tous les calculs détaillés
- **Tests rapides** : `npm run quick:final` - 3 scénarios pré-configurés
- **Documentation complète** : [LPV2-ANALYSIS.md](../docs/LPV2-ANALYSIS.md)
- **Guide utilisateur simple** : [CALCULATEUR_SIMPLE.md](../docs/CALCULATEUR_SIMPLE.md)

## 🤝 Support

Pour toute question :
1. Consulter la documentation complète
2. Vérifier les exemples dans `scripts/`
3. Lancer les tests : `npm run test:lpv2`

---

**Dernière mise à jour :** 2024  
**Version :** 1.0.0  
**Auteur :** FlowCap Team
