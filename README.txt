REPÈRE — PUBLICATION STATIQUE

Ce dossier contient uniquement l’application compilée, prête à héberger.

1. Dans votre dépôt GitHub dédié, chargez tous les fichiers de ce dossier à la racine (index.html doit être à la racine, sans sous-dossier publication).
2. Settings > Pages : choisissez Deploy from a branch, branche main, dossier / (root), puis Save. Aucun workflow Actions n’est nécessaire pour ces fichiers déjà compilés.
3. Attendez le déploiement et ouvrez l’adresse HTTPS réelle affichée dans Pages.
4. Autorisez cette adresse finale dans la configuration des redirections Supabase. Installez ensuite Repère sur chaque téléphone.

Le code compilé contient l’adresse Supabase et sa clé publique, comme toute application cliente. Les mots de passe, clés serveur et données de vos comptes ne font pas partie de ce dossier. La base et ses règles d’accès contrôlent les données privées.

Ne chargez aucun ZIP des sources, fichier .env, sauvegarde personnelle ou dossier source dans ce dépôt de publication. Pour mettre à jour, recompilez la version connectée, relancez ce script puis remplacez ces mêmes fichiers.

Les notifications à application fermée demandent également les clés VAPID et le service serveur de rappels configurés. Ce dossier seul ne les active pas.
