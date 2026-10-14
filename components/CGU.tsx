
import React from 'react';
import { ArrowLeft, Shield, FileText, Lock } from 'lucide-react';
import { Page } from '../types';

interface CGUProps {
  onNavigate?: (page: Page) => void;
  onClose?: () => void;
}

export const CGU: React.FC<CGUProps> = ({ onNavigate, onClose }) => {
  const handleBack = () => {
    if (onClose) {
      onClose();
    } else if (onNavigate) {
      onNavigate('home');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        
        {/* Header */}
        <div className="bg-emerald-900 p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
             <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
               <path d="M0 100 C 50 0 50 100 100 0 Z" fill="white" />
             </svg>
          </div>
          <div className="relative z-10">
            <button 
              onClick={handleBack}
              className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors mb-6 text-sm font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> {onClose ? "Fermer et revenir à l'inscription" : "Retour à l'accueil"}
            </button>
            <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-emerald-400" />
              Politique de Protection des Données
            </h1>
            <p className="text-emerald-100 opacity-80">
              Politique de protection des données de la société bziiit. À jour au 22 Janvier 2026.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 md:p-12 space-y-12 text-slate-700 leading-relaxed text-justify">
          
          <section>
            <p className="mb-6 font-medium">
              Politique de protection des données de la société bziiit (ci-après la Société).
            </p>
            <p className="mb-6">
              Cette politique de protection des données s'inscrit dans une logique de transparence et d'information de l'utilisateur quant au traitement de ses données.
            </p>
            
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" /> Définitions
              </h3>
              <ul className="space-y-4 text-sm">
                <li><strong className="text-slate-900">Application :</strong> Solution informatique qui permet à l'Utilisateur d'utiliser les Fonctionnalités et Services proposés par bziiit SAS par l'intermédiaire d'une application dédiée ;</li>
                <li><strong className="text-slate-900">Compte :</strong> Système d'accès dédié à l'Utilisateur exigeant un identifiant et un mot de passe confidentiels et personnels ;</li>
                <li><strong className="text-slate-900">Donnée :</strong> Tout élément (informations, textes, messages, etc.) transmis par l'Utilisateur, ou par un Partenaire ou Tiers et implémenté par lui au sein du Site et des Services au travers de son utilisation ;</li>
                <li><strong className="text-slate-900">Donnée à Caractère Personnel :</strong> désigne toute information se rapportant à une personne physique identifiée ou identifiable, ainsi que de manière plus large toutes données relatives à l'exploitation agricole. Est réputée être une « personne physique identifiable » une personne physique qui peut être identifiée, directement ou indirectement, notamment par référence à un identifiant, tel qu'un nom, un numéro d'identification, des données de localisation, un identifiant en ligne, ou à un ou plusieurs éléments spécifiques propres à son identité physique, physiologique, génétique, psychique, économique, culturelle ou sociale (Article 4 du Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016) ;</li>
                <li><strong className="text-slate-900">Espace utilisateur :</strong> espace en ligne à destination de l'Utilisateur ayant un Compte afin d'utiliser les Services de bziiit SAS et des Prestataires tiers, le cas échéant ;</li>
                <li><strong className="text-slate-900">Fonctionnalité :</strong> Chaque élément implémenté, accessible et utilisable au sein des différents Services ;</li>
                <li><strong className="text-slate-900">Moyens d'Accès :</strong> Méthodes et/ou fonctions par lesquelles l'Utilisateur peut accéder à un ou plusieurs Services afin de les utiliser pour ses propres besoins ;</li>
                <li><strong className="text-slate-900">Opérateur :</strong> Société qui opère différents réseaux de télécommunications électroniques nécessaires à l'accès et à l'utilisation des Services ;</li>
                <li><strong className="text-slate-900">Partie :</strong> Personnes qui ont signé et adhèrent aux CGU et aux obligations qu'elles contiennent ;</li>
                <li><strong className="text-slate-900">Prestataires tiers :</strong> désigne les prestataires proposant une solution intégrée aux Services mais n'étant pas éditée par bziiit ;</li>
                <li><strong className="text-slate-900">Services :</strong> Ensemble des prestations mises à disposition de l'Utilisateur par bziiit et accessibles via les Moyens d'Accès ;</li>
                <li><strong className="text-slate-900">Société :</strong> désigne bziiit SAS, société par actions simplifiée au capital social de 252.788 €, dont le siège est situé 6 RUE DU COURANT, 33310 LORMONT, immatriculée au Registre du Commerce et des Sociétés de Bordeaux sous le numéro 813 829 876, représentée par Monsieur Laurent TRIPIED, en qualité de Président ;</li>
                <li><strong className="text-slate-900">Tiers :</strong> Désigne des personnes physiques ou morales qui ne sont pas liées par une propriété ou un contrôle commun(e) (c.-à-.d. non-affiliés) à bziiit SAS ou d'autres individus sans relation avec bziiit SAS et/ou l'Utilisateur ;</li>
                <li><strong className="text-slate-900">Utilisateur :</strong> Personne accédant au Site, à son Instance et à l'Application smartphone ;</li>
                <li><strong className="text-slate-900">Support :</strong> Système de déclaration et de suivi d'incident et de demandes d'aide par ticket concernant l'Application.</li>
              </ul>
            </div>
          </section>

          <section className="space-y-10">
            
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1 - Où sont hébergées vos Données ?</h2>
              <p>Toutes les Données sont hébergées en France, dans des Data Centers de nos prestataires : OVH et Hostinger.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2 - Qui collecte vos Données ?</h2>
              <p>Dans le cadre de la gestion et du fonctionnement du Site, en sa qualité de responsable de traitement au titre de la Loi Informatique et Libertés en date du 6 janvier 1978, telle que modifiée, la Société est susceptible de collecter les Données personnelles des Utilisateurs.</p>
              <p className="mt-2">La Société attache une grande importance au respect de la vie privée et prend toutes les mesures nécessaires pour assurer la confidentialité et la sécurité des données personnelles des Utilisateurs.</p>
              <p className="mt-2">À cette fin, la Société invite les Utilisateurs à prendre connaissance de la présente Politique de protection des données afin d'être informés des modalités de traitement de leurs Données et de leurs droits.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3 - Pour quelles finalités les données sont-elles collectées ?</h2>
              <p className="mb-2">La Société utilise les Données personnelles des Utilisateurs pour les finalités suivantes :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Fourniture des Services liés à l'accompagnement, la formation et le développement d'outils logiciels ;</li>
                <li>Gestion des prospects ;</li>
                <li>Prise en compte des commandes des services par les Utilisateurs ; Gestion et traitement des commandes ;</li>
                <li>Facturation ;</li>
                <li>Réponse aux éventuelles questions/réclamations des Utilisateurs ; Elaboration de statistiques commerciales ;</li>
                <li>Gestion des demandes de droits d'accès, de rectification, d'opposition et de portabilité ;</li>
                <li>Gestion des impayés et du contentieux.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4 - Quel est le fondement de la collecte des Données ?</h2>
              <p>Les Données sont collectées par la Société afin de fournir les Services demandés, dans le cadre exclusif des relations contractuelles entre l'Utilisateur et la Société.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">5 - Qui sont les destinataires des données personnelles ? Les Données sont-elles transmises à des Tiers ?</h2>
              <p>Les Données des Utilisateurs sont collectées et traitées par la Société.</p>
              <p className="mt-2">Certaines Données peuvent également être communiquées aux sous-traitants de la Société qui agissent au nom et pour le compte de la Société, et notamment l'hébergeur du Site, le prestataire de paiement et le prestataire de chat en ligne.</p>
              <p className="mt-2">Lorsque l'Utilisateur commande un service qui sera réalisé par un Prestataire tiers, une liste des Données qui seront communiquées au Prestataire est préalablement communiquée à l'Utilisateur qui est alors libre de confirmer sa commande ou non.</p>
              <p className="mt-2">Les Données de l'Utilisateur ne seront pas communiquées à un Prestataire tiers sans l'accord préalable et exprès de l'Utilisateur.</p>
              <p className="mt-2">La Société peut communiquer les données personnelles des Utilisateurs afin de coopérer avec les autorités administratives et judiciaires.</p>
              <p className="mt-2">La Société peut enfin communiquer les données personnelles des Utilisateurs à des prestataires tiers dans le cadre d'études statistiques de l'utilisation du Site et à des fins d'optimisation du Site. Dans ce cadre, les données personnelles des Utilisateurs seront anonymisées.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">6 - Quelles sont les Données pouvant être collectées par la Société ?</h2>
              <p>La Société s'engage à ne collecter que les Données strictement nécessaires à la fourniture de ses Services.</p>
              <p className="mt-2">L'Utilisateur peut toutefois transmettre à la Société, par l'intermédiaire de son Instance, des Données spécifiques par l'intermédiaire de « champs libres ». A cet égard, l'Utilisateur devra prêter une attention particulière à ces Données complémentaires et non nécessaires aux Services.</p>
              <p className="mt-2">L'Utilisateur s'engage ainsi à limiter les Données qu'il pourrait transmettre à bziiit en dehors des Données strictement nécessaires à l'utilisation des Services.</p>
              
              <p className="mt-4 mb-2 font-semibold">Dans le cadre de la fourniture de ses Services, la Société peut être amenée à collecter :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Des données de contact (nom, prénom, adresse email, adresse postale, etc.) liées à des personnes physiques ;</li>
                <li>Des données de contact (dénomination, enseigne, adresse, etc.) liées à des exploitations agricoles et des sociétés ;</li>
                <li>Des données brutes transmises par l'Utilisateur et liées à l'activité de l'exploitation agricole :
                  <ul className="list-circle pl-5 mt-1 space-y-1">
                    <li>carnet de contact,</li>
                    <li>calendrier,</li>
                    <li>échanges,</li>
                    <li>éléments comptables et fiscaux,</li>
                    <li>données bancaires,</li>
                    <li>données financières,</li>
                    <li>données relatives aux achats et aux ventes,</li>
                    <li>données relatives aux stocks,</li>
                    <li>données relatives aux ressources humaines de l'exploitation,</li>
                    <li>données d'analyse de production (analyse de sol, de l'eau, etc.),</li>
                    <li>données cartographiques liées à l'exploitation,</li>
                    <li>données liées aux installations présentes sur l'exploitation,</li>
                    <li>données liées à la gestion et l'élevage des bêtes (nombre, alimentation, etc.),</li>
                    <li>données vétérinaires,</li>
                    <li>données liées à l'assolement,</li>
                    <li>données liées aux interventions réalisées sur l'exploitation,</li>
                    <li>données phytosanitaires liées à l'exploitation ;</li>
                  </ul>
                </li>
                <li>Données agricoles primaires générées par la Société dans le cadre de la mise à disposition des Services (inventaire, gestion des suivis des stocks, alertes, rapports, etc.) ;</li>
                <li>Données agricoles agrégées générées par la Société et/ou des Prestataires tiers relatives au croisement de certaines données spécifiques (géolocalisation, utilisations de capteurs, etc.) ;</li>
                <li>Données liées à l'identifiant de connexion, notamment par l'intermédiaire de cookies ;</li>
                <li>Des données liées à l'abonnement choisi ;</li>
                <li>L'historique des échanges entre l'Utilisateur et la Société ;</li>
                <li>Des données bancaires ;</li>
                <li>Des données de connexion (adresse ip, etc.).</li>
              </ul>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <h2 className="text-lg font-bold text-emerald-900 mb-2">6.1 - Géolocalisation</h2>
              <p className="text-emerald-800 text-sm">Aucune données de géolocalisation n'est collectées.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">7 - Puis-je refuser que certaines Données soient collectées et/ou utilisées par la Société ?</h2>
              <p>L'Utilisateur peut à tout moment supprimer des Données ou demander la limitation de l'exploitation des Données.</p>
              <p className="mt-2">Dans ce cadre, certains Services nécessitant la collecte des Données pourraient être affectés ou inaccessibles.</p>
              <p className="mt-2 mb-1">Exemples de services partenaires requérant l'exploitation de Données de l'Utilisateur :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>plateformes web proposant des services complémentaires aux fonctionnalités proposées par la Société ;</li>
                <li>logiciels ;</li>
                <li>outils cartographiques (image satellite, fonds de carte...) ;</li>
                <li>IoT (capteurs connectés, solutions RTK, récepteurs & consoles...) ;</li>
                <li>robotique, drone.</li>
              </ul>
              <p className="mt-2">La Société informera ainsi l'Utilisateur des risques potentiels sur l'utilisation des Services dans l'hypothèse où certaines Données seraient supprimées, non renseignées ou limitées.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">8 - Pourquoi la Société utilise-t-elle des cookies ?</h2>
              <p>Conformément à la délibération de la CNIL n° 2013-378 du 5 décembre 2013, la Société informe les Utilisateurs que des cookies enregistrent certaines informations qui sont stockées dans la mémoire de leur disque dur.</p>
              <p className="mt-2">Ces informations servent à générer des statistiques d'audience du Site et à proposer des services selon les Services qu'ils ont déjà sélectionnés lors de leurs précédentes visites.</p>
              <p className="mt-2">Un message d'alerte, sous forme de bandeau, demande à chaque personne visitant le Site, au préalable, s'il souhaite accepter les cookies. Ces cookies ne contiennent pas d'informations confidentielles concernant les Utilisateurs du Site.</p>
              <p className="mt-2">L'Utilisateur se rendant sur la page d'accueil ou une autre page du Site directement à partir d'un moteur de recherche sera informé :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
                <li>des finalités précises des cookies utilisés ;</li>
                <li>de la durée de conservation des cookies sur le terminal de l'Utilisateur ;</li>
                <li>de la possibilité de s'opposer à ces cookies et de changer les paramètres en cliquant sur un lien présent dans le bandeau ;</li>
                <li>et du fait que la poursuite de sa navigation vaut accord au dépôt de cookies sur son terminal.</li>
              </ul>
              <p className="mt-2">Pour garantir le consentement libre et éclairé de l'Utilisateur visitant le Site, le bandeau ne disparaîtra pas tant qu'il n'aura pas poursuivi sa navigation.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">9 - Pourquoi la Société collecte-t-elle l'adresse IP ?</h2>
              <p>Chaque ordinateur connecté au réseau Internet dispose d'une adresse IP.</p>
              <p className="mt-2">Dès lors qu'un Utilisateur navigue sur le Site, la Société collecte l'adresse IP de l'Utilisateur afin d'analyser le trafic sur le Site et fournir à l'Utilisateur les Services.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">10 - Quels sont les droits de l'Utilisateur sur ses Données ?</h2>
              <p>Les Utilisateurs conservent la maîtrise exclusive de l'ensemble des Données transmises à la Société.</p>
              <p className="mt-2">Les Utilisateurs sont informés qu'ils disposent d'un droit d'accès, de rectification, de portabilité, de suppression, de limitation ainsi que d'un droit d'opposition pour motif légitime au traitement de leurs données à caractère personnel.</p>
              <p className="mt-2">L'Utilisateur a droit de retirer son consentement, c'est à dire d'exercer son droit de retrait, à tout moment, pour des raisons tenant à sa situation particulière, à tout ou partie du Traitement des Données non anonymisées en cas de (i) cession à un Tiers de la base de données à laquelle ses Données sont intégrées (ii) changement de contrôle de la Société (iii) modification des termes du présent Contrat.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">11 - Comment modifier et accéder à ses Données ?</h2>
              <p>L'Utilisateur peut saisir en ligne toutes les données relatives à la gestion de son exploitation.</p>
              <p className="mt-2">Les Données personnelles figurant notamment sur les factures ainsi que les adresses mail et les numéros de téléphones sont modifiables depuis l'Instance client.</p>
              <p className="mt-2">L'ensemble des Données transmises par le Client peuvent être modifiées par ce dernier.</p>
              <p className="mt-2">Certaines Données collectées par la Société de manière automatique (Données de connexion notamment) ne peuvent être modifiées par l'Utilisateur.</p>
              <p className="mt-2">Les coordonnées de contact de la Société sont indiquées à la fin de la présente politique de protection des Données.</p>
              <p className="mt-2">La Société fera ses meilleurs efforts afin de répondre à la demande du Client dans les meilleurs délais.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">12 - Comment demander la portabilité de ses Données ?</h2>
              <p>La Société s'engage à permettre à l'Utilisateur d'exercer son droit à la portabilité de ses Données, sur simple demande de celui-ci.</p>
              <p className="mt-2">À cet égard, en cas de demande en ce sens, la Société fournira dans les meilleurs délais à l'Utilisateur l'ensemble des Données brutes collectées par la Société, dans un format accessible et permettant une réutilisation ultérieure.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">13 - Comment sont enregistrées les données bancaires ?</h2>
              <p>Lors d'un paiement, la Société utilise les moyens d'un prestataire de paiement extérieur afin de garantir la fluidité et la qualité de ses services.</p>
              <p className="mt-2">Concernant le paiement en ligne, la Société peut notamment avoir recours à la société STRIPE (https://stripe.com/ie).</p>
              <p className="mt-2">La politique de confidentialité de Stripe est accessible à l'adresse suivante : https://stripe.com/ie/privacy</p>
              <p className="mt-2">Le prestataire collecte notamment, lors d'un paiement, des Données Personnelles concernant vos moyens de paiement (numéro de carte bancaire, date de fin de validité de la carte bancaire, cryptogramme visuel, ce dernier n'étant pas conservé, etc.).</p>
              <p className="mt-2">Il est rappelé que la Société ne collecte et ne détient aucune donnée bancaire directement.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">14 - Quelle est la durée de conservation des Données ? Que se passe-t-il à la fin du contrat ?</h2>
              <p>Par principe, les Données transmises par l'Utilisateur à la Société ne sont conservées que pendant la durée de la relation contractuelle entre l'Utilisateur et la Société.</p>
              <p className="mt-2">En l'occurrence, les Données sont en principe conservées tant que l'Utilisateur dispose d'un compte actif.</p>
              <p className="mt-2">Dans l'hypothèse où l'Utilisateur ne se connecterait pas à son Instance pendant 10 (dix) mois consécutifs, la Société lui enverrait alors une demande d'information afin de savoir s'il souhaite continuer à bénéficier de son compte ou si ce compte doit être supprimé.</p>
              <p className="mt-2">En l'absence de réponse dans un délai de 2 (deux) mois à compter de cette demande d'information, les Données liées à ce compte seront supprimées.</p>
              <p className="mt-2">En toute hypothèse, à la fin de la relation contractuelle, les Données sont, au choix de l'Utilisateur :</p>
              <ul className="list-disc pl-5 space-y-1 text-sm mt-1">
                <li>supprimées sans délai de manière irréversible et sécurisées ;</li>
                <li>transmises dans un délai ne pouvant excéder 15 jours à l'Utilisateur dans un format accessible pour une réutilisation ultérieure.</li>
              </ul>
              <p className="mt-2">Il est à noter que certaines données, nécessairement anonymisées, pourront être conservées par la Société à des fins d'analyse.</p>
              <p className="mt-2">En outre, les données liées à la facturation du Client par la Société seront conservées par la Société afin de respecter ses obligations légales.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">15 - Comment la Société assure-t-elle la sécurité de la conservation des Données ?</h2>
              <p>La Société veille à sécuriser les Données des Utilisateurs de manière adéquate et appropriée et a pris les précautions utiles afin de préserver la sécurité et la confidentialité des données et notamment empêcher qu'elles ne soient déformées, endommagées ou communiquées à des personnes non autorisées.</p>
              <p className="mt-2">La Société accorde une importance particulière à la sécurité des accès physique et logiques des serveurs sur lesquels les Données sont collectées.</p>
              <p className="mt-2">Les serveurs utilisés sont situés exclusivement en Europe et répondent à des normes strictes en matière de sécurité.</p>
              <p className="mt-2">L'ensemble des Données stockées sur les serveurs sont chiffrées et font l'objet de sauvegardes récurrentes.</p>
              <p className="mt-2">En outre, l'intégralité des collaborateurs de la Société se sont engagées à maintenir la plus grande confidentialité à l'occasion de leur prestation.</p>
              <p className="mt-2">Enfin, la Société s'assure que l'intégralité de ses Prestataires Tiers respectent la présente politique de protection et disposent de méthodes permettant la sécurité des Données et des transmissions.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">16 - Comment la Société assure-t-elle la sécurité des transmissions de Données ?</h2>
              <p>La Société assure la sécurité des transmissions des Données par l'intermédiaire d'un protocole de chiffrement TLS 256 bits sur l'intégralité du Site internet et de l'Instance client.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" /> 17 - Quelles sont les obligations des Utilisateurs ?
              </h2>
              <p>Les Utilisateurs reconnaissent que les Données divulguées par eux sur le Site sont valides, adéquates et à jour.</p>
              <p className="mt-2">Seuls les Utilisateurs sont responsables de leurs données personnelles communiquées.</p>
              <p className="mt-2">Les Utilisateurs s'engagent à ne pas porter atteinte à la vie privée et à la protection des données personnelles de toute personne tierce.</p>
              <p className="mt-2">En outre, les Utilisateurs s'engagent à protéger leurs identifiants de connexion à leur Instance.</p>
              <p className="mt-2">Dans ce cadre, la Société suggère d'utiliser un mot de passe d'au moins 9 caractères, comportant au moins une majuscule, un chiffre et un caractère spécial.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">18 - Qu'en est-il de la prospection commerciale par courriel ?</h2>
              <p>La Société peut envoyer aux Utilisateurs qui l'ont accepté des sollicitations commerciales.</p>
              <p className="mt-2">Si, par la suite, les Utilisateurs ne souhaitent plus recevoir de telles sollicitations par courrier électronique, les Utilisateurs peuvent à tout moment envoyer un email gratuitement et sans fournir d'autre motif à la Société.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">19 - Comment les Utilisateurs sont-ils informés des modifications de la présente Politique de protection des données ?</h2>
              <p>La Société peut modifier la présente Politique de Protection des données à tout moment.</p>
              <p className="mt-2">La Société informera les Utilisateurs par tout moyen des modifications apportées à la présente.</p>
              <p className="mt-2">La Société invite les Utilisateurs à prendre régulièrement connaissance de la Politique de Confidentialité afin de se tenir parfaitement informés de ses dispositions.</p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">20 - Que se passe-t-il en cas de décès ou d'incapacité de l'Utilisateur ?</h2>
              <p>L'Utilisateur peut ajouter, s'il le souhaite, des accès spécifiques à certaines personnes identifiées sur son Instance, leur attribuer des rôles au sein de l'exploitation et choisir les droits qu'il leurs ouvre sur son Instance.</p>
              <p className="mt-2">Dans ce cadre, et en cas d'incapacité ou de décès, son exploitation ne sera donc pas paralysée.</p>
              <p className="mt-2">Le représentant légal de l'Utilisateur devenu incapable pourra demander à la Société de régénérer un mot de passe, à condition qu'il puisse prouver cette qualité.</p>
              <p className="mt-2">En cas de décès, un mot de passe sera régénéré par la Société et sera transmis aux héritiers de l'Utilisateur à condition qu'ils puissent prouver cette qualité.</p>
            </div>

            <div className="border-t border-slate-200 pt-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">21 - Comment contacter bziiit pour des informations sur le traitement des Données ?</h2>
              <p className="mb-4">Les Utilisateurs peuvent contacter la Société pour toute question qu'ils pourraient avoir sur cette Politique de Protection des Données :</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="bg-slate-50 px-6 py-4 rounded-xl border border-slate-100 flex-1">
                  <span className="block text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Email</span>
                  <a href="mailto:info@bziiit.com" className="font-medium text-slate-900 hover:text-emerald-600 transition-colors">info@bziiit.com</a>
                </div>
                <div className="bg-slate-50 px-6 py-4 rounded-xl border border-slate-100 flex-1">
                  <span className="block text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Courrier postal</span>
                  <span className="font-medium text-slate-900">6 rue du Courant 33 310 LORMONT - France</span>
                </div>
              </div>
            </div>

          </section>

          <div className="pt-8 flex justify-center">
            <button 
              onClick={handleBack}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
            >
              {onClose ? "J'ai compris, fermer" : "J'ai compris, retour au site"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
