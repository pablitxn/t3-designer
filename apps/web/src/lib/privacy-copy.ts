import { privacyDetails } from './privacy-settings'
import { CONSENT_MONTHS } from './analytics-policy'

type PrivacySection = {
  id: string
  title: string
  paragraphs: readonly string[]
  links?: readonly { label: string; href: string }[]
}

type PrivacyCopy = {
  preferences: string
  policy: string
  title: string
  introduction: string
  accept: string
  reject: string
  withdraw: string
  close: string
  backToApp: string
  pageIntro: string
  pageAnalyticsOff: string
  contents: string
  reviewedOnLabel: string
  contactLabel: string
  choiceTitle: string
  choice: Record<'pending' | 'accepted' | 'rejected', string>
  status: Record<'available' | 'config' | 'signals' | 'storage' | 'tracker', string>
  active: string
  inactive: string
  lifetime: string
  version: string
  sections: readonly PrivacySection[]
}

const cnilComplaints = 'https://www.cnil.fr/fr/plaintes'
const osmPrivacy = 'https://osmfoundation.org/wiki/Privacy_Policy'

/** Separate from the dossier's translation catalogs; operational facts have one source. */
export const privacyCopy: Record<'es' | 'en' | 'fr', PrivacyCopy> = {
  es: {
    preferences: 'Preferencias de privacidad',
    policy: 'Política de privacidad',
    title: 'Analytics opcional',
    introduction: 'Si el operador lo configura y vos aceptás, usamos Umami para contar visitas y entender qué funciones de T3 Designer resultan útiles. Hasta que aceptes, no cargamos el tracker ni enviamos solicitudes de analytics. Podés rechazar y seguir usando toda la app.',
    accept: 'Aceptar analytics',
    reject: 'Rechazar analytics',
    withdraw: 'Retirar el permiso',
    close: 'Cerrar privacidad',
    backToApp: 'Volver a T3 Designer',
    pageIntro: 'Esta política explica qué datos se tratan al visitar T3 Designer, para qué se usan y cómo ejercer tus derechos. La medición de audiencia es opcional y se controla por separado de los registros operativos del sitio.',
    pageAnalyticsOff: 'Esta página de privacidad no se mide. Tu elección de analytics se aplica al volver a la app.',
    contents: 'En esta página',
    reviewedOnLabel: 'Última revisión',
    contactLabel: 'Contacto de privacidad',
    choiceTitle: 'Tu elección',
    choice: {
      pending: 'Todavía no diste tu permiso.',
      accepted: 'Aceptaste analytics opcional.',
      rejected: 'Rechazaste analytics opcional.',
    },
    status: {
      available: '',
      config: 'Analytics está deshabilitado: la configuración de este sitio no está habilitada o está incompleta.',
      signals: 'Tu navegador comunica Do Not Track o Global Privacy Control. Respetamos esa señal y mantenemos analytics apagado.',
      storage: 'No podemos guardar o leer tu preferencia de forma segura. Analytics permanece apagado.',
      tracker: 'El tracker no está disponible o está bloqueado. La app sigue funcionando.',
    },
    active: 'Analytics habilitado con tu permiso.',
    inactive: 'Analytics apagado.',
    lifetime: 'Guardamos en tu navegador la elección sobre analytics, la versión de esta política y su vencimiento durante {months} meses. Podés cambiar la elección cuando quieras. Al vencer, analytics se apaga y volvemos a pedir permiso.',
    version: 'Versión de la política',
    sections: [
      {
        id: 'controller',
        title: 'Responsable y contacto',
        paragraphs: [
          privacyDetails ? `${privacyDetails.name} administra esta instalación. Usá el contacto publicado para consultas sobre tus datos.` : 'Esta instalación no publicó información del operador. T3 Designer no define quién administra cada sitio.',
        ],
      },
      {
        id: 'analytics',
        title: 'Medición de audiencia opcional',
        paragraphs: [
          'Con configuración válida y tu consentimiento, Umami mide visitas, navegación entre las secciones, cambios de vista, aperturas del estudio solar, consultas del dossier y clics de descarga de archivos GLB. La finalidad es entender el uso del sitio y mejorar sus funciones. La base jurídica de esta medición es tu consentimiento, conforme al artículo 6.1.a del RGPD.',
          'Se usan secciones y eventos predefinidos, sin enviar nombres, emails, texto libre, contenido del dossier, coordenadas GPS ni identificadores personales personalizados. Las direcciones de analytics no incluyen parámetros ni fragmentos; tampoco enviamos la página de procedencia. No grabamos sesiones, movimientos del cursor ni cada ajuste de los controles.',
          'Las solicitudes llegan al servidor con datos de conexión, como la dirección IP y cabeceras del navegador. Umami puede obtener de ellos información técnica y una ubicación aproximada: país, región o ciudad, según la configuración. No se solicita geolocalización al navegador.',
        ],
      },
      {
        id: 'choices',
        title: 'Consentimiento y preferencias locales',
        paragraphs: [
          'La medición solo se inicia después de aceptar. Rechazar no limita el acceso a la app. Desde «Preferencias de privacidad» podés retirar tu permiso en cualquier momento; se detienen los nuevos envíos sin perder el trabajo abierto. El retiro no afecta a la licitud del tratamiento anterior ni borra por sí mismo los datos ya recibidos.',
          `Respetamos Do Not Track y Global Privacy Control y no intentamos eludir bloqueadores. La elección de analytics, la versión de la política y su vencimiento se guardan únicamente en este navegador durante ${CONSENT_MONTHS} meses. Esta duración no es el plazo de conservación de los datos del servidor.`,
          'Si elegís un idioma, la app también lo recuerda localmente hasta que selecciones «Automático» o borres los datos del sitio. Esta preferencia funcional no se envía como evento de analytics.',
          'La distribución de muebles de la demo se guarda automáticamente en este navegador. Podés borrarla con «Restaurar distribución original» o eliminando los datos del sitio. Las posiciones no se envían al servidor ni a analytics, y no se importan automáticamente en tus proyectos privados.',
        ],
      },
      {
        id: 'maps',
        title: 'Mapa de OpenStreetMap',
        paragraphs: [
          'Al abrir la vista Mapa, tu navegador solicita a OpenStreetMap las imágenes necesarias para la zona visible. El proveedor recibe datos de conexión, como tu IP, información del navegador, el origen de este sitio y las imágenes solicitadas. La app no envía datos de tu cuenta ni solicita tu ubicación GPS.',
          'Estas solicitudes permiten mostrar el mapa y son independientes de tu elección de analytics. Solo se realizan mientras la vista Mapa está abierta; no precargamos regiones ni ofrecemos descargas sin conexión. El navegador reutiliza las imágenes según las cabeceras de caché del proveedor.',
        ],
        links: [{ label: 'Política de privacidad de OpenStreetMap Foundation', href: osmPrivacy }],
      },
      {
        id: 'operational-logs',
        title: 'Registros operativos',
        paragraphs: [
          privacyDetails?.operationalLogs ?? 'El servidor que entrega estos archivos puede generar registros de conexión. El operador debe informar su contenido y finalidad. Rechazar analytics no controla los registros del alojamiento.',
        ],
      },
      {
        id: 'hosting',
        title: 'Alojamiento y destinatarios',
        paragraphs: [
          privacyDetails?.hosting ?? 'Esta instalación no publicó proveedor, ubicación de alojamiento ni destinatarios. T3 Designer no presupone una infraestructura concreta.',
        ],
      },
      {
        id: 'retention',
        title: 'Conservación de los datos',
        paragraphs: [
          privacyDetails?.retention ?? 'El operador no publicó plazos de conservación de datos del servidor. El software no garantiza un plazo de eliminación para registros, analytics ni copias de seguridad del alojamiento.',
        ],
      },
      {
        id: 'rights',
        title: 'Tus derechos',
        paragraphs: [
          'Podés solicitar acceso, rectificación, supresión y limitación del tratamiento de tus datos. También podés ejercer oposición y portabilidad cuando correspondan. Para solicitarlo, contactá al responsable con los datos indicados arriba.',
          'Solo se pedirá la información necesaria para atender la solicitud y, si existen dudas razonables, confirmar tu identidad. Algunos datos de medición pueden no permitir vincular una visita con una persona; si esto impide atender una solicitud, se explicará el motivo. La medición no se amplía solo para poder identificar visitantes.',
          'Podés presentar una reclamación ante la autoridad de protección de datos competente, incluida la CNIL en Francia. La app no toma decisiones automatizadas con efectos jurídicos o similares sobre visitantes.',
        ],
        links: [{ label: 'Presentar una reclamación ante la CNIL', href: cnilComplaints }],
      },
      {
        id: 'changes',
        title: 'Cambios en esta política',
        paragraphs: [
          'La información de alojamiento y conservación la proporciona el operador. Una nueva revisión de privacidad invalida el consentimiento previo de analytics y requiere una nueva elección.',
        ],
      },
    ],
  },
  en: {
    preferences: 'Privacy preferences',
    policy: 'Privacy policy',
    title: 'Optional analytics',
    introduction: 'If the operator configures it and you accept, we use Umami to count visits and understand which T3 Designer features are useful. Until you accept, we do not load the tracker or send analytics requests. You can reject analytics and keep using the whole app.',
    accept: 'Accept analytics',
    reject: 'Reject analytics',
    withdraw: 'Withdraw permission',
    close: 'Close privacy',
    backToApp: 'Back to T3 Designer',
    pageIntro: 'This policy explains how T3 Designer processes data when you visit, what the data is used for and how to exercise your rights. Audience measurement is optional and controlled separately from the records used to operate the website.',
    pageAnalyticsOff: 'This privacy page is not measured. Your analytics choice applies when you return to the app.',
    contents: 'On this page',
    reviewedOnLabel: 'Last reviewed',
    contactLabel: 'Privacy contact',
    choiceTitle: 'Your choice',
    choice: {
      pending: 'You have not given permission yet.',
      accepted: 'You accepted optional analytics.',
      rejected: 'You rejected optional analytics.',
    },
    status: {
      available: '',
      config: 'Analytics is disabled: this site’s configuration is disabled or incomplete.',
      signals: 'Your browser sends Do Not Track or Global Privacy Control. We respect that signal and keep analytics off.',
      storage: 'We cannot safely save or read your preference. Analytics remains off.',
      tracker: 'The tracker is unavailable or blocked. The app still works.',
    },
    active: 'Analytics enabled with your permission.',
    inactive: 'Analytics off.',
    lifetime: 'Your analytics choice, this policy’s version and the expiry date are saved in your browser for {months} months. You can change your choice at any time. On expiry, analytics stops and we ask again.',
    version: 'Policy version',
    sections: [
      {
        id: 'controller',
        title: 'Controller and contact',
        paragraphs: [
          privacyDetails ? `${privacyDetails.name} operates this installation. Use the published contact for questions about your data.` : 'This installation has not supplied operator details. T3 Designer does not determine who operates each website.',
        ],
      },
      {
        id: 'analytics',
        title: 'Optional audience measurement',
        paragraphs: [
          'With valid configuration and your consent, Umami measures visits, navigation between sections, view changes, opening the solar study, consulting the dossier and clicks to download GLB files. The purpose is to understand website usage and improve its features. The legal basis for this measurement is your consent under Article 6(1)(a) of the GDPR.',
          'Only predefined sections and events are used. Events do not contain names, emails, free text, dossier content, GPS coordinates or custom personal identifiers. Analytics addresses exclude query parameters and fragments; we also omit the referring page. We do not record sessions, cursor movements or each control adjustment.',
          'Requests reach the server with connection data such as IP addresses and browser headers. Umami may derive technical information and an approximate location from them: country, region or city, depending on configuration. We do not request browser geolocation.',
        ],
      },
      {
        id: 'choices',
        title: 'Consent and local preferences',
        paragraphs: [
          'Measurement starts only after acceptance. Rejecting it does not restrict access to the app. You can withdraw permission at any time through “Privacy preferences”; new requests stop without losing your open work. Withdrawal does not affect the lawfulness of earlier processing or automatically erase data already received.',
          `We respect Do Not Track and Global Privacy Control and do not try to bypass blockers. Your analytics choice, the policy version and the expiry date are stored only in this browser for ${CONSENT_MONTHS} months. This period is separate from server data retention.`,
          'If you select a language, the app also remembers it locally until you select “Automatic” or clear the website’s data. This functional preference is not sent as an analytics event.',
          'The demo furniture layout is saved automatically in this browser. Remove it with “Restore original layout” or by clearing the website’s data. Positions are not sent to the server or analytics, and are not automatically imported into your private projects.',
        ],
      },
      {
        id: 'maps',
        title: 'OpenStreetMap map',
        paragraphs: [
          'When you open Map view, your browser requests the images needed for the visible area from OpenStreetMap. The provider receives connection data such as your IP address, browser information, this site’s origin and the images requested. The app does not send account data or request your GPS location.',
          'These requests display the map and are independent of your analytics choice. They only occur while Map view is open; we do not preload regions or offer offline downloads. Your browser reuses images according to the provider’s cache headers.',
        ],
        links: [{ label: 'OpenStreetMap Foundation privacy policy', href: osmPrivacy }],
      },
      {
        id: 'operational-logs',
        title: 'Operational logs',
        paragraphs: [
          privacyDetails?.operationalLogs ?? 'The server delivering these files may produce connection logs. The operator must describe their contents and purpose. Rejecting analytics does not control hosting logs.',
        ],
      },
      {
        id: 'hosting',
        title: 'Hosting and recipients',
        paragraphs: [
          privacyDetails?.hosting ?? 'This installation has not supplied its hosting provider, location or recipients. T3 Designer does not assume a particular infrastructure.',
        ],
      },
      {
        id: 'retention',
        title: 'Data retention',
        paragraphs: [
          privacyDetails?.retention ?? 'The operator has not supplied server-data retention periods. The software does not guarantee a deletion schedule for hosting logs, analytics or backups.',
        ],
      },
      {
        id: 'rights',
        title: 'Your rights',
        paragraphs: [
          'You can request access, rectification, erasure and restriction of the processing of your personal data. You may also exercise objection and portability rights where applicable. To make a request, contact the controller using the details above.',
          'Only information needed to handle your request will be requested, including confirmation of identity if there are reasonable doubts. Some measurement data may not allow a visit to be linked to a person; if this prevents fulfilling a request, the reason will be explained. We do not expand audience measurement solely to identify visitors.',
          'You can lodge a complaint with the competent data protection authority, including the CNIL in France. The app does not make automated decisions that produce legal or similarly significant effects on visitors.',
        ],
        links: [{ label: 'Lodge a complaint with the CNIL', href: cnilComplaints }],
      },
      {
        id: 'changes',
        title: 'Changes to this policy',
        paragraphs: [
          'Hosting and retention statements are supplied by the operator. A new privacy revision invalidates previous analytics consent and requires a new choice.',
        ],
      },
    ],
  },
  fr: {
    preferences: 'Préférences de confidentialité',
    policy: 'Politique de confidentialité',
    title: 'Mesure d’audience facultative',
    introduction: 'Si l’opérateur le configure et que vous acceptez, nous utilisons Umami pour compter les visites et comprendre quelles fonctions de T3 Designer sont utiles. Avant votre acceptation, nous ne chargeons pas le traceur et n’envoyons aucune requête de mesure d’audience. Vous pouvez refuser et continuer à utiliser toute l’application.',
    accept: 'Accepter la mesure d’audience',
    reject: 'Refuser la mesure d’audience',
    withdraw: 'Retirer mon accord',
    close: 'Fermer la confidentialité',
    backToApp: 'Revenir à T3 Designer',
    pageIntro: 'Cette politique explique comment T3 Designer traite les données lors de votre visite, à quelles fins et comment exercer vos droits. La mesure d’audience est facultative et se gère séparément des enregistrements utilisés pour exploiter le site.',
    pageAnalyticsOff: 'Cette page de confidentialité ne fait pas l’objet d’une mesure d’audience. Votre choix s’applique à votre retour dans l’application.',
    contents: 'Sur cette page',
    reviewedOnLabel: 'Dernière révision',
    contactLabel: 'Contact pour la confidentialité',
    choiceTitle: 'Votre choix',
    choice: {
      pending: 'Vous n’avez pas encore donné votre accord.',
      accepted: 'Vous avez accepté la mesure d’audience facultative.',
      rejected: 'Vous avez refusé la mesure d’audience facultative.',
    },
    status: {
      available: '',
      config: 'La mesure d’audience est désactivée : la configuration de ce site est désactivée ou incomplète.',
      signals: 'Votre navigateur transmet Do Not Track ou Global Privacy Control. Nous respectons ce signal et maintenons la mesure d’audience désactivée.',
      storage: 'Votre préférence ne peut pas être enregistrée ou lue de manière sûre. La mesure d’audience reste désactivée.',
      tracker: 'Le traceur est indisponible ou bloqué. L’application continue de fonctionner.',
    },
    active: 'Mesure d’audience activée avec votre accord.',
    inactive: 'Mesure d’audience désactivée.',
    lifetime: 'Votre choix de mesure d’audience, la version de cette politique et sa date d’expiration sont conservés dans votre navigateur pendant {months} mois. Vous pouvez modifier votre choix à tout moment. À l’expiration, la mesure s’arrête et votre accord est à nouveau demandé.',
    version: 'Version de la politique',
    sections: [
      {
        id: 'controller',
        title: 'Responsable et contact',
        paragraphs: [
          privacyDetails ? `${privacyDetails.name} exploite cette installation. Utilisez le contact publié pour toute question concernant vos données.` : 'Cette installation n’a pas fourni les coordonnées de son opérateur. T3 Designer ne détermine pas qui exploite chaque site.',
        ],
      },
      {
        id: 'analytics',
        title: 'Mesure d’audience facultative',
        paragraphs: [
          'Avec une configuration valide et votre consentement, Umami mesure les visites, la navigation entre les sections, les changements de vue, l’ouverture de l’étude solaire, la consultation du dossier et les clics de téléchargement de fichiers GLB. La finalité est de comprendre l’utilisation du site et d’améliorer ses fonctions. Cette mesure repose sur votre consentement, conformément à l’article 6, paragraphe 1, point a, du RGPD.',
          'Seuls des sections et événements prédéfinis sont utilisés, sans transmettre de noms, d’emails, de texte libre, de contenu du dossier, de coordonnées GPS ni d’identifiants personnels personnalisés. Les adresses de mesure excluent les paramètres et fragments ; la page de provenance est également omise. Nous n’enregistrons ni les sessions, ni les mouvements du curseur, ni chaque réglage des contrôles.',
          'Les requêtes arrivent au serveur avec des données de connexion, telles que l’adresse IP et les en-têtes du navigateur. Umami peut en déduire des informations techniques et une localisation approximative : pays, région ou ville, selon la configuration. Nous ne demandons pas la géolocalisation du navigateur.',
        ],
      },
      {
        id: 'choices',
        title: 'Consentement et préférences locales',
        paragraphs: [
          'La mesure commence uniquement après acceptation. Le refus ne limite pas l’accès à l’application. Vous pouvez retirer votre accord à tout moment dans « Préférences de confidentialité » ; les nouveaux envois s’arrêtent sans perdre le travail ouvert. Le retrait ne remet pas en cause la licéité des traitements antérieurs et n’efface pas automatiquement les données déjà reçues.',
          `Nous respectons Do Not Track et Global Privacy Control et ne cherchons pas à contourner les bloqueurs. Votre choix de mesure d’audience, la version de la politique et sa date d’expiration sont conservés uniquement dans ce navigateur pendant ${CONSENT_MONTHS} mois. Ce délai est distinct de la conservation des données sur le serveur.`,
          'Si vous choisissez une langue, l’application la mémorise également localement jusqu’à la sélection du mode « Automatique » ou à l’effacement des données du site. Cette préférence fonctionnelle n’est pas transmise comme événement de mesure d’audience.',
          'L’agencement des meubles de démonstration est enregistré automatiquement dans ce navigateur. Vous pouvez l’effacer avec « Restaurer l’agencement original » ou en supprimant les données du site. Les positions ne sont envoyées ni au serveur ni à la mesure d’audience, et ne sont pas importées automatiquement dans vos projets privés.',
        ],
      },
      {
        id: 'maps',
        title: 'Carte OpenStreetMap',
        paragraphs: [
          'Lorsque vous ouvrez la vue Carte, votre navigateur demande à OpenStreetMap les images nécessaires à la zone visible. Le fournisseur reçoit des données de connexion telles que votre adresse IP, des informations sur le navigateur, l’origine de ce site et les images demandées. L’application ne transmet pas les données de votre compte et ne demande pas votre position GPS.',
          'Ces requêtes permettent d’afficher la carte et sont indépendantes de votre choix de mesure d’audience. Elles ont lieu uniquement lorsque la vue Carte est ouverte ; nous ne préchargeons pas de régions et ne proposons pas de téléchargement hors ligne. Le navigateur réutilise les images selon les en-têtes de cache du fournisseur.',
        ],
        links: [{ label: 'Politique de confidentialité de la Fondation OpenStreetMap', href: osmPrivacy }],
      },
      {
        id: 'operational-logs',
        title: 'Journaux opérationnels',
        paragraphs: [
          privacyDetails?.operationalLogs ?? 'Le serveur qui diffuse ces fichiers peut produire des journaux de connexion. L’opérateur doit en décrire le contenu et la finalité. Refuser la mesure d’audience ne contrôle pas les journaux de l’hébergement.',
        ],
      },
      {
        id: 'hosting',
        title: 'Hébergement et destinataires',
        paragraphs: [
          privacyDetails?.hosting ?? 'Cette installation n’a pas publié son hébergeur, le lieu d’hébergement ou les destinataires. T3 Designer ne suppose aucune infrastructure particulière.',
        ],
      },
      {
        id: 'retention',
        title: 'Conservation des données',
        paragraphs: [
          privacyDetails?.retention ?? 'L’opérateur n’a pas publié de durées de conservation des données du serveur. Le logiciel ne garantit aucun délai de suppression pour les journaux, la mesure d’audience ou les sauvegardes de l’hébergement.',
        ],
      },
      {
        id: 'rights',
        title: 'Vos droits',
        paragraphs: [
          'Vous pouvez demander l’accès, la rectification, l’effacement et la limitation du traitement de vos données. Vous pouvez également exercer les droits d’opposition et de portabilité lorsqu’ils s’appliquent. Pour toute demande, contactez le responsable aux coordonnées indiquées ci-dessus.',
          'Seules les informations nécessaires au traitement de la demande seront sollicitées, y compris pour confirmer votre identité en cas de doute raisonnable. Certaines données de mesure peuvent ne pas permettre de relier une visite à une personne ; si cela empêche de donner suite à une demande, le motif sera expliqué. La mesure d’audience n’est pas enrichie dans le seul but d’identifier les visiteurs.',
          'Vous pouvez introduire une réclamation auprès de l’autorité de protection des données compétente, notamment la CNIL en France. L’application ne prend aucune décision automatisée produisant des effets juridiques ou similaires significatifs sur les visiteurs.',
        ],
        links: [{ label: 'Adresser une plainte à la CNIL', href: cnilComplaints }],
      },
      {
        id: 'changes',
        title: 'Modifications de cette politique',
        paragraphs: [
          'Les informations d’hébergement et de conservation sont fournies par l’opérateur. Une nouvelle révision de confidentialité invalide l’ancien consentement et demande un nouveau choix.',
        ],
      },
    ],
  },
}
