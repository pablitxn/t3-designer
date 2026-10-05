const dossier = {
  "ui": {
    "status": {
      "official": "Source publique",
      "reported": "Déclaré",
      "estimated": "Estimé",
      "observed": "Observé",
      "pending": "À documenter",
      "derived": "Calculé",
      "demo": "Donnée fictive"
    },
    "review": {
      "original-pending": "Original à vérifier",
      "disputed": "Écart à résoudre",
      "pending": "Documents en attente",
      "checked": "Vérifié"
    },
    "sourceKind": {
      "public-record": "Registre public",
      "reference": "Référence fournie",
      "model": "Reconstitution du projet",
      "official-guide": "Guide officiel"
    },
    "sections": {
      "overview": "Vue d’ensemble",
      "apartment": "L’appartement",
      "building": "Bâtiment et parcelle",
      "energy": "Énergie et environnement",
      "sources": "Bibliothèque des sources",
      "questions": "Scénario complet"
    },
    "titles": {
      "overview": {
        "eyebrow": "01 / Le dossier",
        "title": "Une démo complète.",
        "description": "Identité, surfaces, annexes, énergie et environnement de la résidence fictive réunis dans une fiche prête à explorer."
      },
      "apartment": {
        "eyebrow": "02 / Échelle intérieure",
        "title": "L’appartement en détail.",
        "description": "Surfaces déclarées, état visible et références de la reconstitution."
      },
      "building": {
        "eyebrow": "03 / Échelle du bâtiment",
        "title": "Le lieu qui l’abrite.",
        "description": "Géométrie de parcelle et de bâtiment avec valeurs illustratives."
      },
      "energy": {
        "eyebrow": "04 / Contexte et performance",
        "title": "Énergie et environnement.",
        "description": "Consommation, budget, lots, risques et urbanisme du scénario fictif de 2026."
      },
      "sources": {
        "eyebrow": "05 / Les preuves",
        "title": "Chaque donnée a une origine.",
        "description": "Références du scénario fictif, géométrie du modèle et guides méthodologiques identifiés séparément."
      },
      "questions": {
        "eyebrow": "06 / Scénario d’exemple",
        "title": "Scénario complet.",
        "description": "Données illustratives préparées pour parcourir toute la démo."
      }
    },
    "heroKicker": "Fiche de démonstration complète",
    "heroTitle": "Résidence du Jardin.<br/><accent>Une démo à explorer.</accent>",
    "heroDescription": "Un T3 fictif à Quimper, avec surfaces, énergie, coûts et environnement renseignés. La carte utilise un repère public et les données du scénario sont identifiées comme des exemples.",
    "reviewDate": "Démo révisée · 05 oct. 2026",
    "statsLabel": "Chiffres du dossier",
    "apartmentArea": "Surface du T3",
    "carrezReported": "Surface intérieure illustrative",
    "plot": "La parcelle",
    "cadastralArea": "Surface de parcelle illustrative",
    "buildingHeight": "Hauteur du bâtiment",
    "ignRecord": "Géométrie du modèle",
    "accuracy": "précision",
    "evidenceGathered": "Références de l’exemple",
    "sources": "sources",
    "recordsReferences": "Scénario, modèle et guides",
    "explore": "Explorer le dossier",
    "documentationSections": "Rubriques de la fiche du bien",
    "readData": "Comment lire les données",
    "legend": "Les données fictives complètent le scénario 2026 ; estimations et calculs décrivent le modèle. Les guides officiels expliquent des méthodes sans certifier cet exemple.",
    "print": "Imprimer cette rubrique",
    "searchInFile": "Recherche dans le dossier",
    "findInSources": "Chercher parmi les sources.",
    "searchLabel": "Rechercher dans le dossier",
    "searchPlaceholder": "Rechercher une donnée ou une source…",
    "clearSearch": "Effacer la recherche",
    "results_one": "{{count}} résultat pour « {{query}} »",
    "results_other": "{{count}} résultats pour « {{query}} »",
    "emptyTitle": "Cette donnée est introuvable.",
    "emptyDescription": "Essayez « surface », « cadastre » ou « énergie ».",
    "backToFile": "Retour au dossier",
    "factsHeading": "Données et caractéristiques",
    "sourcesHeading": "Sources",
    "questionsHeading": "Scénario complet",
    "observedHeading": "État observé",
    "aptLabel": "Appartement / T3",
    "eightRooms": "Huit pièces.<br/>Une même histoire.",
    "apartmentIntro": "Deux chambres, séjour, cuisine et espaces de service. Balcon et cave indiqués séparément.",
    "exploreAreas": "Explorer les surfaces",
    "reconstructedPlan": "Plan reconstitué · proportions estimées",
    "placeIdentity": "Identité de l’exemple",
    "oneBuilding": "Un bâtiment de démonstration",
    "rnbRelation": "Références internes d’une résidence fictive, avec un point public d’exemple à Quimper.",
    "consultBuilding": "Consulter le bâtiment et la parcelle",
    "floorConfirmation": "Troisième étage, balcon et cave.",
    "floorDescription": "T3 au troisième étage avec deux chambres, un balcon côté cour et une cave séparée. Les surfaces des annexes sont présentées séparément de l’intérieur.",
    "seePending": "Explorer la démo complète",
    "documentedIdentity": "Identité de démonstration",
    "allSources": "Voir toutes les sources",
    "tourApartment": "Parcourir l’appartement",
    "returnInterior": "Revenir à l’intérieur et à sa lumière",
    "viewBuildingSun": "Voir le bâtiment et le soleil",
    "placeInContext": "Le situer dans son environnement",
    "openPlan": "Ouvrir l’image du plan et ses surfaces",
    "planAlt": "Plan du modèle T3 avec surfaces illustratives et géométrie approximative",
    "currentReference": "Plan généré à partir du modèle.",
    "estimatedShapes": "Surfaces illustratives ; formes et longueurs approximatives.",
    "openFullPlan": "Ouvrir le plan complet",
    "areasAttachments": "Surfaces, annexes et dimensions",
    "referencesShow": "Ce que montrent les références",
    "observationCaveat": "Inventaire des éléments représentés dans le modèle. Il ne s’agit pas d’une inspection de l’état d’un logement réel.",
    "fromCadastre": "De la parcelle au bâtiment",
    "plotFootprintVolume": "La parcelle, l’emprise<br/>et le volume.",
    "scalesDescription": "Ce sont différentes échelles du même lieu. Chaque surface et hauteur conserve la définition et la précision de sa source.",
    "view3d": "Voir le contexte en 3D",
    "mapLabel": "Place Saint-Corentin · Quimper · repère public d’exemple",
    "nextLayer": "Le scénario énergétique de la démo",
    "learnPerformance": "Énergie et coûts.<br/>Une année d’exemple.",
    "dpeMissing": "DPE D, 6 200 kWh et un budget de 900–1 200 € pour 2026 : des valeurs fictives pour explorer la fiche, distinctes des simulations solaires.",
    "energyDiagnosis": "DPE fictif",
    "conventionalPerformance": "Classe D fictive · scénario du T3 en 2026.",
    "estimatedCost": "Coût annuel fictif",
    "diagnosisRange": "900–1 200 € pendant 2026, énergie et abonnements inclus.",
    "actualUse": "Consommation annuelle fictive",
    "billsEnergyPeriod": "6 200 kWh d’énergie finale pour tout le T3 en 2026.",
    "sourceEvidence": "Fiche de preuve",
    "closeSource": "Fermer la fiche source",
    "sourceType": "Type de source",
    "consultationReview": "Consultation ou revue",
    "originalSource": "Ouvrir le guide de méthode",
    "availableCopy": "Voir l’exemple documenté",
    "linkedFacts": "Données liées",
    "dateCaveat": "La date indique la révision de l’exemple. Les valeurs fictives proviennent du scénario 2026 ; les guides généraux ne certifient pas un bien.",
    "sourceCard": "Voir la fiche source",
    "tableCaption": "Surfaces illustratives partagées avec le modèle",
    "room": "Pièce",
    "area": "Surface",
    "reportedTotal": "Total intérieur illustratif",
    "areaSumCaption": "La somme conserve les valeurs du modèle ; elle ne certifie ni la surface Carrez ni une surface nette.",
    "libraryNote": "Le scénario fictif, la géométrie et les calculs disposent de leurs propres références. Les guides officiels servent de documentation méthodologique et ne justifient pas les valeurs inventées.",
    "downloadExtract": "Télécharger les données d’exemple",
    "questionsIntro": "Le scénario est complet et ses données fictives sont distinguées des estimations du modèle.",
    "footerTitle": "Résidence du Jardin · Démo complète",
    "footerDescription": "Scénario fictif de 2026, géométrie illustrative et références méthodologiques.",
    "footerDate": "Démo · octobre 2026",
    "sitePlanAlt": "Plan local de la parcelle et du bâtiment de démonstration, nord en haut",
    "apartmentPlanAlt": "Plan schématique de l’appartement : surfaces déclarées et formes estimées",
    "mapPlot": "Parcelle {{label}} · démo",
    "noData": "Aucune donnée",
    "unknown": "Inconnu",
    "openOriginalEvidence": "Voir la preuve source",
    "dateFormat": "short",
    "scope": {
      "Dirección": "Adresse",
      "Parcela": "Parcelle",
      "Edificio": "Bâtiment",
      "Grupo BDNB": "Groupe d’exemple",
      "Departamento": "Appartement",
      "Estancia": "Pièce",
      "Balcón": "Balcon",
      "Cave": "Cave",
      "Entorno": "Environnement"
    },
    "contentLabel": "Contenu du dossier immobilier",
    "originalLocator": "Référence de l’exemple"
  },
  "facts": {
    "official-address": {
      "label": "Nom de la résidence fictive",
      "value": "{{value}}",
      "note": "Nom créé pour cette démo. Le repère public de la carte permet d’explorer Quimper et ne désigne ni bien ni propriétaire réels."
    },
    "ban-address-id": {
      "label": "Identifiant local du scénario",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "address-point": {
      "label": "Point de référence de la carte",
      "value": "{{value}}",
      "note": "Repère public sur la place Saint-Corentin, à Quimper. Il situe la carte, pas la résidence fictive ; la référence solaire régionale est documentée séparément."
    },
    "rnb-id": {
      "label": "Référence locale du bâtiment",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "ign-id": {
      "label": "Identifiant local du volume",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "parcel-id": {
      "label": "Parcelle de démonstration",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "parcel-area": {
      "label": "Surface illustrative de parcelle",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "bdnb-group": {
      "label": "Groupe de démonstration",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "construction-year": {
      "label": "Année illustrative",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "dwelling-count": {
      "label": "Logements du groupe",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "building-footprint": {
      "label": "Emprise de référence",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "building-height": {
      "label": "Hauteur du modèle",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "building-mean-height": {
      "label": "Hauteur moyenne illustrative",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "ground-altitudes": {
      "label": "Altitudes min. / max. du sol",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "roof-altitudes": {
      "label": "Altitudes min. / max. du toit",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "roof-range": {
      "label": "Écart vertical du toit",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "building-storeys": {
      "label": "Étages illustratifs",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "source-accuracy": {
      "label": "Incertitude de la géométrie d’origine",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "wall-material": {
      "label": "Matériau des murs",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "roof-material": {
      "label": "Matériau de toiture",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "ign-record-updated": {
      "label": "Révision de la démo",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "apartment-carrez": {
      "label": "Surface intérieure illustrative",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "apartment-area-sum": {
      "label": "Somme des huit pièces",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "balcony-area": {
      "label": "Balcon",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "basement-area": {
      "label": "Cave en sous-sol",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "floor-plan": {
      "label": "Étage représenté",
      "value": "Troisième étage illustratif",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "floor-model": {
      "label": "Étage du modèle",
      "value": "Troisième étage illustratif",
      "note": "Troisième étage illustratif avec balcon donnant sur la cour. La cave est présentée comme une annexe distincte de l’intérieur."
    },
    "living-orientation": {
      "label": "Séjour et cuisine côté cour",
      "value": "Sud-ouest · {{azimuth}}°",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "ceiling-height": {
      "label": "Hauteur intérieure du modèle",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "apartment-dpe": {
      "label": "DPE fictif",
      "value": "D",
      "note": "Classe D fictive pour le T3 du scénario 2026. Cette catégorie illustrative ne correspond ni à un diagnostic établi ni à une déduction de la consommation."
    },
    "actual-energy-use": {
      "label": "Consommation annuelle fictive",
      "value": "{{value}}",
      "note": "Énergie finale fictive pour tout le T3, du 1er janvier au 31 décembre 2026. Chauffage, eau chaude et électricité domestique inclus ; valeur distincte de la consommation conventionnelle du DPE."
    },
    "energy-cost": {
      "label": "Coût énergétique annuel fictif",
      "value": "{{value}}",
      "note": "Budget fictif pour tout le T3 de janvier à décembre 2026, énergie et abonnements inclus. La fourchette accompagne le scénario de 6 200 kWh ; ce ne sont ni des factures ni un tarif commercial."
    },
    "legal-lots": {
      "label": "Lots et copropriété fictifs",
      "value": "12 · appartement / 42 · cave",
      "note": "Lots fictifs 12 (T3) et 42 (cave), avec une quote-part illustrative totale de 21/1 000 des parties communes. Scénario 2026 sans effet juridique ni lien avec des contrats réels."
    },
    "risks": {
      "label": "Profil de risques fictif",
      "value": "Inondation faible · radon 3",
      "note": "Profil fictif de la parcelle de démonstration pour 2026 : faible exposition aux inondations et radon de niveau 3. Il ne décrit pas les risques de la place Saint-Corentin et ne constitue pas un état des risques."
    },
    "planning": {
      "label": "Urbanisme fictif",
      "value": "UA · usage résidentiel",
      "note": "Zonage fictif de 2026 : logements et commerces de proximité, avec conservation de l’aspect des façades. Règles créées pour la démo, sans les attribuer au règlement d’urbanisme de Quimper."
    },
    "room-area-bedroom-1": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-bedroom-2": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-living": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-entrance": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-wc": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-bathroom": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-kitchen": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    },
    "room-area-closet": {
      "label": "Surface : {{room}}",
      "value": "{{value}}",
      "note": "Surface d’exemple partagée avec la géométrie, sans mesure indépendante ni certificat."
    }
  },
  "sources": {
    "ban": {
      "title": "Localisation de l’exemple",
      "description": "Repère public sur la place Saint-Corentin, à Quimper, choisi pour naviguer sur la carte. Il ne situe ni la résidence fictive ni le bâtiment reconstitué.",
      "label": "Modèle de démonstration"
    },
    "rnb": {
      "title": "Identité de démonstration",
      "description": "Identifiants locaux d’exemple sans lien publié avec un registre de bâtiments réels.",
      "label": "Modèle de démonstration"
    },
    "cadastre": {
      "title": "Parcelle de démonstration",
      "description": "Géométrie locale conservée et surface illustrative pour comparer parcelle, emprise et intérieur.",
      "label": "Modèle de démonstration"
    },
    "ign": {
      "title": "Géométrie de contexte",
      "description": "Géométrie adaptée de données ouvertes. Identifiants et géolocalisation généralisés ; attribution conservée. Ce n’est pas un dossier officiel du site d’exemple.",
      "label": "Modèle de démonstration"
    },
    "bdnb": {
      "title": "Caractéristiques d’exemple",
      "description": "Valeurs illustratives d’âge, de matériaux et de logements conservées pour expliquer les différentes échelles du dossier.",
      "label": "Modèle de démonstration"
    },
    "plan": {
      "title": "Plan du modèle",
      "description": "Plan rendu depuis le modèle public. Les surfaces sont des valeurs d’exemple, pas un certificat ni une transcription de diagnostic.",
      "label": "Modèle de démonstration"
    },
    "visual": {
      "title": "Inventaire visuel du modèle",
      "description": "Inventaire des éléments visibles de la reconstruction. Les documents, photos et vidéos originaux ne font pas partie de ce dossier public.",
      "label": "Modèle de démonstration"
    },
    "model": {
      "title": "Hypothèses de reconstruction",
      "description": "Dimensions, hauteur, orientation et placement sont des hypothèses de démonstration. Géométrie et calculs restent reproductibles.",
      "label": "Modèle de démonstration"
    },
    "ademe": {
      "title": "Comment lire un DPE",
      "description": "Guide général pour comprendre un DPE. La classe D de l’exemple provient du scénario fictif, pas d’un diagnostic établi.",
      "label": "Guide de méthode"
    },
    "georisques": {
      "title": "Méthode de recherche des risques",
      "description": "Guide général de la terminologie des risques. Le profil de la démo provient du scénario fictif, pas de ce guide.",
      "label": "Guide de méthode"
    },
    "copropriete": {
      "title": "Documents de copropriété",
      "description": "Guide général pour distinguer bâtiments, propriété et lots juridiques. L’exemple ne contient aucun contrat privé.",
      "label": "Guide de méthode"
    },
    "planning": {
      "title": "Méthode de recherche urbanistique",
      "description": "Guide général des plans et règlements. Le zonage de la démo appartient au scénario fictif et ne désigne pas une parcelle réelle.",
      "label": "Guide de méthode"
    },
    "demo-scenario": {
      "title": "Scénario fictif complet · 2026",
      "description": "Identité, énergie, coûts, lots, risques et urbanisme créés pour cette démo. Période illustrative du 1er janvier au 31 décembre 2026, sans documents ni propriétaires réels.",
      "label": "Données fictives · scénario 2026"
    }
  },
  "questions": {
    "floor-discrepancy": {
      "title": "Vérifier l’étage dans un cas réel",
      "description": "Cette démonstration conserve des hypothèses du modèle pour expliquer la méthode. Elle n’affirme aucun fait documentaire propre à un bien.",
      "needed": "Pour un cas réel, réunir plans autorisés, mesures et documents pertinents ; noter leur date, leur portée et leur incertitude."
    },
    "original-area": {
      "title": "Vérifier les surfaces avec des preuves autorisées",
      "description": "Cette démonstration conserve des hypothèses du modèle pour expliquer la méthode. Elle n’affirme aucun fait documentaire propre à un bien.",
      "needed": "Pour un cas réel, réunir plans autorisés, mesures et documents pertinents ; noter leur date, leur portée et leur incertitude."
    },
    "geometry": {
      "title": "Calibrer dimensions et orientation",
      "description": "Cette démonstration conserve des hypothèses du modèle pour expliquer la méthode. Elle n’affirme aucun fait documentaire propre à un bien.",
      "needed": "Pour un cas réel, réunir plans autorisés, mesures et documents pertinents ; noter leur date, leur portée et leur incertitude."
    },
    "individual-dpe": {
      "title": "Distinguer les sources énergétiques",
      "description": "Cette démonstration conserve des hypothèses du modèle pour expliquer la méthode. Elle n’affirme aucun fait documentaire propre à un bien.",
      "needed": "Pour un cas réel, réunir plans autorisés, mesures et documents pertinents ; noter leur date, leur portée et leur incertitude."
    },
    "parcel-context": {
      "title": "Étudier le contexte d’un bien réel",
      "description": "Cette démonstration conserve des hypothèses du modèle pour expliquer la méthode. Elle n’affirme aucun fait documentaire propre à un bien.",
      "needed": "Pour un cas réel, réunir plans autorisés, mesures et documents pertinents ; noter leur date, leur portée et leur incertitude."
    }
  },
  "observations": {
    "hall-condition": {
      "room": "Entrée",
      "title": "Sol et équipements visibles",
      "description": "Usure localisée du sol près de l’accès salle d’eau/WC, tuyaux apparents et panneau au-dessus du passage vers le séjour. Détails représentés dans le modèle illustratif."
    },
    "living-condition": {
      "room": "Séjour",
      "title": "Parquet, placard et accès au balcon",
      "description": "Parquet usé, panneau de placard cassé, radiateur près de la cuisine et porte vitrée à deux vantaux vers le balcon. Les proportions appartiennent au modèle d’exemple."
    },
    "bedroom-openings": {
      "room": "Chambres",
      "title": "Fenêtres et radiateurs",
      "description": "Deux chambres avec fenêtres à deux vantaux, caissons de volets, protections extérieures et radiateurs. Leur disposition suit les surfaces représentées sur le plan."
    },
    "kitchen-layout": {
      "room": "Cuisine",
      "title": "Équipement en U",
      "description": "Équipement en U : plans de travail, meubles bas, évier, réfrigérateur, four/plaques, hotte, micro-ondes et chaudière. Inventaire visuel du scénario d’exemple."
    },
    "bathroom-fixtures": {
      "room": "Salle d’eau",
      "title": "Lavabo, lave-linge et douche",
      "description": "Lavabo rond sur meuble, lave-linge frontal, miroir, douche et cloison en briques de verre. Disposition et proportions du modèle illustratif."
    },
    "wc-door": {
      "room": "WC",
      "title": "Pièce séparée",
      "description": "Toilettes avec réservoir, ventilation haute et porte ouvrant vers l’entrée. Pièce et passage suivent les proportions estimées du modèle."
    }
  },
  "publishers": {
    "ban": "T3 Designer",
    "rnb": "T3 Designer",
    "cadastre": "T3 Designer",
    "ign": "IGN · BD TOPO / T3 Designer",
    "bdnb": "T3 Designer",
    "plan": "T3 Designer",
    "visual": "T3 Designer",
    "model": "T3 Designer",
    "ademe": "ADEME · Service Public",
    "georisques": "Géorisques",
    "copropriete": "Service Public",
    "planning": "Géoportail de l’urbanisme",
    "demo-scenario": "T3 Designer"
  },
  "evidenceLocators": {
    "official-address": [
      "demo-evidence.json#values.official-address"
    ],
    "ban-address-id": [
      "demo-evidence.json#values.ban-address-id"
    ],
    "address-point": [
      "demo-evidence.json#values.address-point"
    ],
    "rnb-id": [
      "demo-evidence.json#values.rnb-id"
    ],
    "ign-id": [
      "demo-evidence.json#values.ign-id"
    ],
    "parcel-id": [
      "demo-evidence.json#values.parcel-id"
    ],
    "parcel-area": [
      "demo-evidence.json#values.parcel-area"
    ],
    "bdnb-group": [
      "demo-evidence.json#values.bdnb-group"
    ],
    "construction-year": [
      "demo-evidence.json#values.construction-year"
    ],
    "dwelling-count": [
      "demo-evidence.json#values.dwelling-count"
    ],
    "building-footprint": [
      "demo-evidence.json#values.building-footprint"
    ],
    "building-height": [
      "demo-evidence.json#values.building-height"
    ],
    "building-mean-height": [
      "demo-evidence.json#values.building-mean-height"
    ],
    "ground-altitudes": [
      "demo-evidence.json#values.ground-altitudes"
    ],
    "roof-altitudes": [
      "demo-evidence.json#values.roof-altitudes"
    ],
    "roof-range": [
      "demo-evidence.json#values.roof-range"
    ],
    "building-storeys": [
      "demo-evidence.json#values.building-storeys"
    ],
    "source-accuracy": [
      "demo-evidence.json#values.source-accuracy"
    ],
    "wall-material": [
      "demo-evidence.json#values.wall-material"
    ],
    "roof-material": [
      "demo-evidence.json#values.roof-material"
    ],
    "ign-record-updated": [
      "demo-evidence.json#values.ign-record-updated"
    ],
    "apartment-carrez": [
      "demo-evidence.json#values.apartment-carrez"
    ],
    "apartment-area-sum": [
      "demo-evidence.json#values.apartment-area-sum"
    ],
    "balcony-area": [
      "demo-evidence.json#values.balcony-area"
    ],
    "basement-area": [
      "demo-evidence.json#values.basement-area"
    ],
    "floor-plan": [
      "demo-evidence.json#values.floor-plan"
    ],
    "floor-model": [
      "demo-evidence.json#values.floor-model"
    ],
    "living-orientation": [
      "demo-evidence.json#values.living-orientation"
    ],
    "ceiling-height": [
      "demo-evidence.json#values.ceiling-height"
    ],
    "apartment-dpe": [
      "demo-evidence.json#values.apartment-dpe"
    ],
    "actual-energy-use": [
      "demo-evidence.json#values.actual-energy-use"
    ],
    "energy-cost": [
      "demo-evidence.json#values.energy-cost"
    ],
    "legal-lots": [
      "demo-evidence.json#values.legal-lots"
    ],
    "risks": [
      "demo-evidence.json#values.risks"
    ],
    "planning": [
      "demo-evidence.json#values.planning"
    ],
    "room-area-bedroom-1": [
      "t3Apartment.rooms[id=bedroom-1].reportedArea"
    ],
    "room-area-bedroom-2": [
      "t3Apartment.rooms[id=bedroom-2].reportedArea"
    ],
    "room-area-living": [
      "t3Apartment.rooms[id=living].reportedArea"
    ],
    "room-area-entrance": [
      "t3Apartment.rooms[id=entrance].reportedArea"
    ],
    "room-area-wc": [
      "t3Apartment.rooms[id=wc].reportedArea"
    ],
    "room-area-bathroom": [
      "t3Apartment.rooms[id=bathroom].reportedArea"
    ],
    "room-area-kitchen": [
      "t3Apartment.rooms[id=kitchen].reportedArea"
    ],
    "room-area-closet": [
      "t3Apartment.rooms[id=closet].reportedArea"
    ]
  }
} as const

export default dossier
