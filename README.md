# Mara Pastel

La vitrine se trouve à la racine et l’administration à `/admin`. Aucune dépendance à installer. Pour ouvrir les deux pages en local avec Python déjà disponible, lancer `python3 -m http.server 3000` depuis le dépôt. Le serveur livre `admin/index.html` à l’adresse `/admin/`. En production, servir le site statique en HTTPS avec la résolution des index de dossiers. La vitrine conserve son contenu d’origine tant que Supabase est indisponible ou vide.

## Activer l’administration

1. Dans le SQL Editor du projet Supabase, exécuter une fois la migration [202611180001_mara_admin.sql](supabase/migrations/202611180001_mara_admin.sql). Elle initialise le contenu publié et limite les droits de publication, d’import des photos et de lecture des messages aux administrateurs.
2. Créer le compte du gestionnaire dans **Authentication → Users**. Copier son identifiant UUID, puis exécuter `insert into public.mara_admins (user_id) values ('UUID_DU_COMPTE');` dans le SQL Editor. La connexion utilise son adresse e-mail et son mot de passe. Un compte Supabase non autorisé est refusé. Désactiver l’inscription publique si le projet est dédié à cette vitrine.
3. Renseigner dans [supabase-config.js](supabase-config.js) l’URL du projet (`https://<ref>.supabase.co`) et sa clé **publishable** (ou l’ancienne clé **anon**). Les identifiants du gestionnaire et les clés privées restent hors des fichiers publics.
4. Ouvrir `/admin` et se connecter. Modifier l’accueil, les fiches des pastels ou la section « Notre histoire ». Pour la galerie, ajouter un événement, saisir son nom et importer une ou plusieurs photos. Le bouton **Publier sur la vitrine** applique les modifications ensemble. Un titre ou texte vide rétablit le texte d’origine. Les photos peuvent être retirées de la vitrine. Les fichiers chargés dans le bucket public restent accessibles par leur URL tant qu’ils ne sont pas supprimés du stockage.

## Modifier le mot de passe administrateur

Après connexion, ouvrir **Paramètres du compte** en bas de `/admin`. Saisir l’ancien mot de passe, le nouveau et sa confirmation. L’administration vérifie d’abord l’ancien mot de passe auprès de Supabase Auth. Elle conserve la session validée par code si la double authentification est active.

Dans les réglages **Authentication → Sign In / Providers → Email** du projet Supabase, activer **Require current password when changing password** pour que Supabase exige aussi l’ancien mot de passe lorsque son API est appelée directement. [Documentation Supabase](https://supabase.com/docs/guides/auth/password-security#require-current-password-when-changing-password)

## Renforcer les accès administrateur

1. Déployer cette version du site. Vercel applique les en-têtes de sécurité définis dans [vercel.json](vercel.json). Si le site change de projet Supabase, modifier aussi l’origine Supabase autorisée dans la politique de sécurité des contenus de ce fichier.
2. Dans le SQL Editor Supabase, exécuter [202611210003_mara_admin_security.sql](supabase/migrations/202611210003_mara_admin_security.sql), après les migrations précédentes. Supabase exige alors une session active pour les opérations d’administration et une session vérifiée par code pour les comptes ayant activé le TOTP.
3. Dans **Paramètres du compte → Configurer le code de connexion**, confirmer le mot de passe, scanner le QR code avec une application d’authentification et saisir le code affiché. Garder un accès de secours à l’application. Si la configuration échoue, vérifier que l’inscription et la vérification TOTP sont activées dans Supabase Auth. [Documentation Supabase](https://supabase.com/docs/guides/auth/auth-mfa/totp)

L’administration se verrouille après 20 minutes d’inactivité. Les brouillons du site restent disponibles dans le même navigateur à la prochaine connexion.

## Enregistrer et exporter les demandes

Avant de déployer la nouvelle vitrine, exécuter la migration [202611210001_mara_orders.sql](supabase/migrations/202611210001_mara_orders.sql) dans le SQL Editor Supabase, après la migration d’administration. Elle crée la table privée `mara_orders` et la fonction de dépôt des demandes. Le site ouvre WhatsApp après confirmation de l’enregistrement par Supabase. Une demande enregistrée reste en attente jusqu’à sa confirmation par Mara Pastel.

Exécuter ensuite [202611210002_mara_livraison_sept_jours.sql](supabase/migrations/202611210002_mara_livraison_sept_jours.sql) pour accepter les sept jours de la semaine. Le jour sélectionné est confirmé sur WhatsApp.

Dans **Demandes de commande**, tu peux actualiser la liste, changer le statut et exporter toutes les demandes. Le bouton **Exporter en PDF** ouvre la fenêtre d’impression. Choisis **Enregistrer au format PDF** pour télécharger le document.

Dans **Réglages**, tu peux modifier les prix, disponibilités, horaires, zones, moyens de paiement et liens sociaux. Les horaires saisis sont affichés sur la vitrine. Les brouillons sont restaurés sur le même navigateur pour la même révision publiée. **Prévisualiser** ouvre la vitrine dans un nouvel onglet avec le brouillon et le dépôt de commande désactivé. **Sauvegarder le contenu** télécharge le texte et les références des médias. La sauvegarde Supabase et la copie des fichiers photo restent nécessaires pour une restauration complète.

## Activer la réception des messages WhatsApp

Le numéro indiqué dans [content.js](content.js) doit être rattaché à **WhatsApp Business Platform Cloud API** et au compte Meta qui envoie les notifications. Le numéro de la vitrine est utilisé pour la redirection WhatsApp, tandis que Meta fournit un **Phone Number ID** distinct.

1. Déployer la fonction Edge `whatsapp-webhook` du dossier [supabase/functions](supabase/functions). Avec un CLI Supabase déjà lié au projet, utiliser `supabase functions deploy whatsapp-webhook --no-verify-jwt`. Si le déploiement se fait dans le Dashboard, utiliser le code de la fonction et désactiver la vérification JWT de la passerelle pour cet endpoint. Le webhook vérifie la signature HMAC de Meta sur le corps brut de chaque notification.
2. Dans les secrets de la fonction Edge, définir `META_APP_SECRET` (secret de l’application Meta), `WHATSAPP_PHONE_NUMBER_ID` (identifiant du numéro) et `WHATSAPP_VERIFY_TOKEN` (chaîne aléatoire à saisir aussi dans la configuration Meta). La fonction utilise `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` fournis côté serveur par Supabase.
3. Dans le tableau de bord Meta, configurer l’URL de rappel `https://<ref>.supabase.co/functions/v1/whatsapp-webhook` avec le jeton de vérification, s’abonner au champ `messages` et vérifier que l’application est abonnée au compte WhatsApp Business du numéro.
4. Depuis la vitrine, préparer puis **envoyer** un message de test dans WhatsApp. Sur `/admin`, actualiser la boîte de réception. Le message doit s’afficher une seule fois, même si Meta répète la notification.

La vitrine ajoute la ligne « Source : site Mara Pastel » aux messages préparés. Le webhook conserve les messages texte entrants du bon numéro qui contiennent cette ligne. Les messages non envoyés, l’historique et les messages dont la ligne a été supprimée avant l’envoi ne peuvent pas être attribués au site. La boîte de réception contient des données client accessibles aux administrateurs autorisés uniquement.
