const dossier = {
  "ui": {
    "status": {
      "official": "Source publique",
      "reported": "Déclaré",
      "estimated": "Estimé",
      "observed": "Observé",
      "pending": "À documenter",
      "derived": "Calculé"
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
      "questions": "À compléter"
    },
    "titles": {
      "overview": {
        "eyebrow": "01 / Le dossier",
        "title": "Une vue complète.",
        "description": "Un exemple complet avec géométrie réutilisable, surfaces illustratives et méthode de recherche. Sans adresse ni dossier d’un logement identifié."
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
        "description": "Les sources disponibles et les éléments nécessaires pour aller plus loin."
      },
      "sources": {
        "eyebrow": "05 / Les preuves",
        "title": "Chaque donnée a une origine.",
        "description": "Cet extrait contient les valeurs du modèle de démonstration. Les dossiers du cas réel ont été retirés ; les guides conservent la méthode et l’attribution."
      },
      "questions": {
        "eyebrow": "06 / Prochaines pièces",
        "title": "Un dossier qui s’étoffe.",
        "description": "Les questions ouvertes et les documents qui aideront à y répondre."
      }
    },
    "heroKicker": "Dossier de démonstration",
    "heroTitle": "Un lieu où vivre.<br/><accent>Et à connaître en détail.</accent>",
    "heroDescription": "Un exemple complet avec géométrie réutilisable, surfaces illustratives et méthode de recherche. Sans adresse ni dossier d’un logement identifié.",
    "reviewDate": "Démo révisée · 04 oct. 2026",
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
    "recordsReferences": "Modèle et guides",
    "explore": "Explorer le dossier",
    "documentationSections": "Rubriques documentaires",
    "readData": "Comment lire les données",
    "legend": "Les valeurs décrivent la démo. Les guides officiels expliquent une méthode sans certifier ce modèle.",
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
    "questionsHeading": "Questions ouvertes",
    "observedHeading": "État observé",
    "aptLabel": "Appartement / T3",
    "eightRooms": "Huit pièces.<br/>Une même histoire.",
    "apartmentIntro": "Deux chambres, séjour, cuisine et espaces de service. Balcon et cave indiqués séparément.",
    "exploreAreas": "Explorer les surfaces",
    "reconstructedPlan": "Plan reconstitué · proportions estimées",
    "placeIdentity": "Identité de l’exemple",
    "oneBuilding": "Un bâtiment de démonstration",
    "rnbRelation": "Identifiants locaux sans lien publié avec une adresse.",
    "consultBuilding": "Consulter le bâtiment et la parcelle",
    "floorConfirmation": "Une hypothèse à vérifier : l’étage.",
    "floorDescription": "Le modèle utilise un troisième étage illustratif. Un cas réel nécessite des documents autorisés pour vérifier l’étage, la cote et le lot.",
    "seePending": "Voir les éléments en attente et l’écart d’étage",
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
    "mapLabel": "Contexte local de démonstration · nord en haut",
    "nextLayer": "La prochaine couche du dossier",
    "learnPerformance": "Comprendre ses performances<br/>à partir de ses documents.",
    "dpeMissing": "La démo n’a pas de DPE. Dans un cas réel, un diagnostic de bâtiment ne s’applique pas automatiquement à chaque appartement.",
    "energyDiagnosis": "Diagnostic énergétique",
    "conventionalPerformance": "Performances conventionnelles et méthode du DPE.",
    "estimatedCost": "Coût estimé",
    "diagnosisRange": "Fourchette du diagnostic et prix de référence.",
    "actualUse": "Consommation réelle",
    "billsEnergyPeriod": "Factures, énergie et période mesurée.",
    "sourceEvidence": "Fiche de preuve",
    "closeSource": "Fermer la fiche source",
    "sourceType": "Type de source",
    "consultationReview": "Consultation ou revue",
    "originalSource": "Ouvrir le guide de méthode",
    "availableCopy": "Voir l’exemple documenté",
    "linkedFacts": "Données liées",
    "dateCaveat": "La date indique la révision de l’exemple. Un guide général n’est pas une preuve propre à un bien.",
    "sourceCard": "Voir la fiche source",
    "tableCaption": "Surfaces illustratives partagées avec le modèle",
    "room": "Pièce",
    "area": "Surface",
    "reportedTotal": "Total intérieur illustratif",
    "areaSumCaption": "La somme conserve les valeurs du modèle ; elle ne certifie ni la surface Carrez ni une surface nette.",
    "libraryNote": "Cet extrait contient les valeurs du modèle de démonstration. Les dossiers du cas réel ont été retirés ; les guides conservent la méthode et l’attribution.",
    "downloadExtract": "Télécharger les données d’exemple",
    "questionsIntro": "Le prochain document peut transformer une hypothèse en donnée étayée. Ces questions rendent visibles les points encore inconnus.",
    "footerTitle": "T3 · Dossier de démonstration",
    "footerDescription": "Géométrie réutilisable, valeurs illustratives et méthodes documentées.",
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
      "label": "Nom du scénario",
      "value": "T3 · Appartement de démonstration",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "ban-address-id": {
      "label": "Identifiant local du scénario",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
    },
    "address-point": {
      "label": "Origine solaire régionale approximative",
      "value": "{{value}}",
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
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
      "note": "Valeur conservée comme exemple du modèle. Ce n’est ni une caractéristique vérifiée d’un bien identifié ni une mesure indépendante."
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
      "label": "DPE de l’appartement",
      "value": "Identification en attente",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
    },
    "actual-energy-use": {
      "label": "Consommation réelle",
      "value": "Aucune facture ajoutée",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
    },
    "energy-cost": {
      "label": "Dépense énergétique",
      "value": "Aucune donnée ajoutée",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
    },
    "legal-lots": {
      "label": "Lots et copropriété",
      "value": "Documents en attente",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
    },
    "risks": {
      "label": "Risques de la parcelle",
      "value": "Recherche spécifique en attente",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
    },
    "planning": {
      "label": "Urbanisme et patrimoine",
      "value": "Zonage à vérifier",
      "note": "Aucun document propre à un bien n’est inclus. Pour un dossier réel, utiliser des preuves autorisées et distinguer consommation mesurée, diagnostic et hypothèses de simulation."
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
      "title": "Localisation de démonstration",
      "description": "Origine régionale approximative pour les calculs solaires. Elle ne désigne ni adresse ni emplacement réel.",
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
      "title": "Comment vérifier un DPE",
      "description": "Guide général de vérification. Un diagnostic réel nécessite ses propres documents autorisés et ne se déduit pas de cette démo.",
      "label": "Guide de méthode"
    },
    "georisques": {
      "title": "Méthode de recherche des risques",
      "description": "Guide général de méthode, sans conclusion de risque propre au scénario de démonstration.",
      "label": "Guide de méthode"
    },
    "copropriete": {
      "title": "Documents de copropriété",
      "description": "Guide général pour distinguer bâtiments, propriété et lots juridiques. L’exemple ne contient aucun contrat privé.",
      "label": "Guide de méthode"
    },
    "planning": {
      "title": "Méthode de recherche urbanistique",
      "description": "Recherche des plans et règlements pour un futur dossier autorisé. La démo n’identifie pas de parcelle cadastrale réelle.",
      "label": "Guide de méthode"
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
      "description": "Une zone de sol soulevée ou cassée est visible près de l’accès salle d’eau/WC, avec des tuyaux apparents et un panneau au-dessus du passage vers le séjour. La cause et l’étendue exacte des dégâts ne sont pas établies."
    },
    "living-condition": {
      "room": "Séjour",
      "title": "Parquet, placard et accès au balcon",
      "description": "Parquet usé, panneau de placard cassé, radiateur près de la cuisine et porte vitrée à deux vantaux vers le balcon. Leur présence est documentée, pas leurs dimensions exactes."
    },
    "bedroom-openings": {
      "room": "Chambres",
      "title": "Fenêtres et radiateurs",
      "description": "Deux fenêtres à deux vantaux, caissons de volets, protection extérieure et radiateurs sous les fenêtres. L’association avec la chambre de 11,81 ou 9,32 m² repose encore sur le plan."
    },
    "kitchen-layout": {
      "room": "Cuisine",
      "title": "Équipement en U",
      "description": "Plans de travail et meubles bas en U, évier, réfrigérateur, four/plaques, hotte, micro-ondes et habillage apparent de chaudière. Le lave-vaisselle et les performances des appareils ne sont pas confirmés."
    },
    "bathroom-fixtures": {
      "room": "Salle d’eau",
      "title": "Lavabo, lave-linge et douche",
      "description": "Lavabo rond sur meuble, lave-linge frontal, miroir, douche et cloison en briques de verre. Le second lavabo apparent est un reflet ; l’ajustement métrique reste à vérifier."
    },
    "wc-door": {
      "room": "WC",
      "title": "Pièce séparée",
      "description": "Toilettes avec réservoir, ventilation haute et porte ouvrant vers l’entrée. Les dimensions réelles de la pièce et la largeur de passage restent à mesurer."
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
    "planning": "Géoportail de l’urbanisme"
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
      "Guía de método; sin documentos del inmueble"
    ],
    "actual-energy-use": [
      "Guía de método; sin documentos del inmueble"
    ],
    "energy-cost": [
      "Guía de método; sin documentos del inmueble"
    ],
    "legal-lots": [
      "Guía de método; sin documentos del inmueble"
    ],
    "risks": [
      "Guía de método; sin documentos del inmueble"
    ],
    "planning": [
      "Guía de método; sin documentos del inmueble"
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
