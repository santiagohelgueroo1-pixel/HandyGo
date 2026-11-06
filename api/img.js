// HandyGo · ilustraciones de cada paso de las guías.
//  GET  /api/img?g=<guía>&i=<paso>  -> imagen de una guía del catálogo (descripción fija, se guarda en la CDN)
//  GET  /api/img?p=<descripción>     -> imagen de una guía armada por el asistente (también se guarda)
//  POST /api/img {mode:"prompts"}    -> Gemini traduce pasos nuevos a descripciones visuales
// Modelo: Cloudflare Workers AI · FLUX.2 [klein] 4B (plan gratuito). Respaldo: FLUX.1 schnell.
// Variables: CF_ACCOUNT_ID, CF_API_TOKEN (obligatorias) · GEMINI_API_KEY (para guías nuevas)

// Las piezas se muestran como una foto de catálogo: es lo que más ayuda a reconocerlas en la casa o en la ferretería
const STYLE = 'Realistic studio product photograph, as in a hardware store catalog. One single object, centered and fully visible, ' +
  'sharp focus, natural true-to-life colors and materials, soft even lighting, plain light grey seamless background. ' +
  'No text, no letters, no numbers, no labels, no logos, no watermark, no people, no hands.';

// Descripciones fijas por guía (mismo orden que los pasos de la app)
const P = {
  canilla: [
    'a hand turning a round chrome water shut-off valve on a tiled bathroom wall, a small curved arrow showing the turning direction',
    'a white bathroom sink seen from above with a folded cloth covering the drain hole',
    'a chrome tap handle with its small decorative cap removed and a screwdriver loosening the central screw',
    'an adjustable wrench loosening the hexagonal nut of a disassembled tap cartridge, a small worn black rubber washer next to it',
    'a new black rubber tap washer being placed on the tap stem, the old cracked washer set aside',
    'a chrome tap closed with no drops falling, a small green check mark floating beside it'
  ],
  inodoro: [
    'a small chrome angle shut-off valve on the wall behind a white toilet, a hand turning it closed',
    'the lid of a white toilet cistern lifted off showing the plastic float valve and float inside the water',
    'a hand removing an old plastic toilet float valve from the cistern, a new float valve next to it',
    'white PTFE plumbing tape being wrapped around a plastic threaded pipe connection',
    'inside a toilet cistern, the water level line slightly below the top of the overflow tube, a small double-headed arrow showing the gap',
    'a white toilet cistern full and calm, water still, small green check mark beside it'
  ],
  pileta: [
    'a bucket placed under the U-shaped white plastic drain trap below a kitchen sink, inside the cabinet',
    'hands unscrewing the two plastic slip nuts of a U-shaped sink drain trap',
    'a removed U-shaped plastic sink trap being emptied into a bucket, a small brush cleaning it',
    'a U-shaped sink trap reassembled under the sink with rubber seals in place, nuts hand tightened',
    'a kitchen sink with the tap open and water flowing smoothly down the drain, green check mark'
  ],
  ducha: [
    'a hand closing a chrome shower mixer tap on a tiled wall',
    'a hand unscrewing a round chrome shower head wrapped in a cloth from its arm',
    'a round shower head soaking in a clear glass bowl of white vinegar',
    'an old toothbrush scrubbing the small nozzles of a shower head',
    'white PTFE tape wrapped around the threaded shower arm before reattaching the shower head',
    'a shower head spraying a strong even fan of water, green check mark'
  ],
  puerta: [
    'a pencil marking the spot where a wooden interior door rubs against its door frame',
    'a screwdriver tightening the screws of a metal door hinge on a wooden door',
    'wooden toothpicks with glue being inserted into a stripped screw hole on a door frame',
    'a sanding block smoothing the top edge of a wooden door, fine dust',
    'a wooden interior door closing smoothly into its frame, small motion arcs, green check mark'
  ],
  enchufe: [
    'a home electrical panel with a row of circuit breakers, one breaker switched to the off position highlighted in amber',
    'a voltage tester screwdriver touching a wall power outlet, its small indicator light off',
    'a wall power outlet with its front cover plate removed, an insulated screwdriver tightening the terminal screws',
    'a white wall outlet cover plate being placed back onto the outlet',
    'a lamp plugged into a wall outlet and glowing, a circuit breaker switched on, green check mark'
  ],
  lampara: [
    'a hand pressing a wall light switch to the off position',
    'a hand unscrewing a light bulb from a ceiling lamp socket',
    'close-up of an empty ceramic light bulb socket, clean and undamaged',
    'a hand screwing a new LED light bulb into a ceiling lamp socket',
    'a ceiling lamp glowing warmly, green check mark'
  ],
  silla: [
    'an office chair turned upside down resting on a folded blanket on the floor, its five-star base with caster wheels facing up',
    'a hand pulling a black plastic caster wheel straight out of the base of an upside-down office chair',
    'close-up of a caster wheel with hair and lint tangled around its axle, small scissors cutting the hair away',
    'a cloth wiping the metal stem of an office chair caster wheel',
    'a spray can of lubricant spraying a short burst onto the axle of a caster wheel',
    'the palm of a hand pushing a caster wheel back into the base of an office chair',
    'an upright office chair rolling smoothly across a floor, small motion lines behind the wheels, green check mark'
  ],
  cajon: [
    'an open wooden drawer being emptied, a few items placed beside it',
    'hands lifting the front of a wooden drawer to pull it out of its metal runners',
    'a cloth cleaning the metal drawer slide rails inside a cabinet',
    'a screwdriver tightening a screw on a metal drawer slide rail inside a cabinet',
    'a spray can of silicone spraying onto a metal drawer slide rail',
    'a wooden drawer sliding smoothly into a cabinet, motion lines, green check mark'
  ],
  mueble: [
    'a wooden table slightly wobbling, small motion lines at one leg joint',
    'an Allen key tightening a bolt at the leg joint of a wooden table',
    'toothpicks with wood glue inserted into a stripped screw hole on wooden furniture, cut flush',
    'a felt pad being stuck under the foot of a wooden chair leg to level it',
    'a small metal L-bracket screwed into the inside corner joint of a wooden table',
    'a sturdy wooden table standing perfectly level, green check mark'
  ],
  cuadro: [
    'a plain wall with a power outlet and a light switch, a dotted vertical line above and below them marked as a no-drill zone in amber',
    'a pencil marking a dot on a wall next to a small spirit level held horizontally',
    'a cordless drill with a masonry drill bit drilling a small hole into a wall',
    'a hammer gently tapping a plastic wall plug into a drilled hole until flush',
    'a screwdriver driving a screw into a wall plug, leaving a few millimeters sticking out',
    'a framed picture hanging straight on a wall, green check mark'
  ],
  inodoro_tapado: [
    'a hand closing the small chrome shut-off valve behind a white toilet',
    'rubber gloves and folded towels laid on a bathroom floor next to a toilet',
    'a rubber toilet plunger placed in a toilet bowl covering the drain opening',
    'a rubber plunger being pushed down and pulled up in a toilet bowl, vertical motion arrows',
    'a bucket of steaming warm water being poured into a toilet bowl',
    'a hand pressing the flush button on a toilet, water flowing down, green check mark'
  ],
  rejilla: [
    'a bucket of water being poured into a square metal floor drain grate in a bathroom',
    'a lifted floor drain grate and a bent wire hook pulling hair out of the drain',
    'baking soda being poured from a cup into a floor drain, a bottle of vinegar beside it',
    'a floor drain covered with its grate and a small kitchen timer beside it',
    'hot steaming water being poured into a floor drain',
    'a clean floor drain grate in a bathroom floor, a small calendar icon, green check mark'
  ],
  silicona: [
    'a utility knife cutting away old dark moldy silicone sealant along the edge of a bathtub',
    'a cloth with alcohol wiping a clean dry joint between a bathtub and wall tiles',
    'two strips of masking tape applied along both sides of the joint between a bathtub and tiles',
    'a caulking gun applying an even bead of white silicone sealant along the bathtub joint',
    'a wet fingertip smoothing a fresh bead of white silicone in a bathtub joint',
    'masking tape being peeled away leaving a neat white silicone line along a bathtub'
  ],
  burlete: [
    'a closed window with small wavy lines showing cold air leaking through the gap around the frame',
    'a cloth cleaning the edge of a window frame',
    'a measuring tape measuring the length of a window frame edge',
    'a roll of self-adhesive foam weather stripping being pressed along a window frame',
    'a closed window sealed tight, no air lines, green check mark'
  ],
  cerradura: [
    'a small tube puffing graphite powder into the keyhole of a door lock',
    'a key being inserted into a door lock keyhole, in and out arrows',
    'a key turning gently inside a door lock, a curved double arrow',
    'a door latch rubbing against the strike plate of a door frame, small contact marks'
  ],
  agujero: [
    'a small hole in a painted wall with a broken plastic wall plug being pulled out',
    'a putty knife pressing white filler into a small hole in a wall',
    'a smooth patch of white wall filler drying on a wall, a small clock beside it',
    'a piece of fine sandpaper sanding a dry filler patch flush with the wall',
    'a small paint brush painting over a repaired spot on a wall to match the color',
    'a perfectly smooth painted wall with no hole, green check mark'
  ],
  lavarropas: [
    'a front-loading washing machine with its power plug pulled out of the wall outlet',
    'a shallow tray and folded towels placed on the floor in front of the lower part of a washing machine',
    'the small filter access door opened at the bottom front of a washing machine',
    'a hand slowly unscrewing the round drain pump filter of a washing machine, water flowing into a tray',
    'a washing machine pump filter being rinsed under a tap, a coin and lint removed from it',
    'a front-loading washing machine running a spin cycle, green check mark'
  ],
  hongos: [
    'an open window, a pair of rubber gloves and a face mask',
    'a bucket with diluted bleach solution, a measuring cup showing one part bleach to three parts water',
    'a sponge gently wiping black mold spots on a white wall near a ceiling',
    'a damp cloth rinsing a cleaned white wall, a small clock beside it',
    'a bright clean wall next to an open window with fresh air lines, a paint roller beside it'
  ],
  aireador: [
    'a hand unscrewing the aerator at the tip of a kitchen tap wrapped in a cloth',
    'a small tap aerator mesh screen with white limescale and grit on it',
    'a tap aerator soaking in a small glass bowl of white vinegar',
    'an old toothbrush scrubbing a small tap aerator under running water',
    'a kitchen tap with a smooth steady stream of water, green check mark'
  ],
  persiana: [
    'a roller shutter fully lowered over a window with a screwdriver wedged between two slats to lock it',
    'the cover plate of a wall-mounted roller shutter strap winder being removed with a screwdriver',
    'an old frayed roller shutter strap being released from the wall winder',
    'a new roller shutter strap being threaded and fixed with a screw to the top roller',
    'a roller shutter rising smoothly over a window, upward arrow, green check mark'
  ]
};

const T = {
 "lavandina": "a white plastic bottle of household bleach next to a bucket of diluted water and a measuring cup",
 "rodillo": "an open roller shutter box above a window showing the horizontal roller tube with the shutter strap wound on it",
 "llave_paso": "a chrome wall-mounted water shut-off valve with a round handle, set into a tiled bathroom wall, near the floor",
 "bacha": "a white ceramic bathroom washbasin with a chrome tap, seen from slightly above",
 "rejilla": "a square stainless steel floor drain grate with small holes, set into bathroom floor tiles",
 "manija": "a chrome cross-head tap handle with a small blue cap in the center, close-up",
 "cuerito": "a small black rubber tap washer the size of a small coin, next to the brass tap stem it fits on",
 "llave_francesa": "a steel adjustable wrench with its knurled adjusting wheel visible",
 "tuerca": "three hexagonal metal nuts of different sizes",
 "cisterna": "a white ceramic toilet with its tank behind the bowl, the tank lid slightly lifted",
 "flotante": "inside an open toilet tank: a plastic float valve with its round float sitting on the water surface",
 "teflon": "a small roll of white PTFE thread seal tape next to a threaded brass pipe fitting",
 "rebalse": "inside an open toilet tank: the vertical plastic overflow tube in the middle, its open top above the water",
 "sifon": "a white plastic U-shaped sink drain trap under a sink, with its two screw nuts",
 "junta": "two black rubber O-ring gaskets of different sizes",
 "flor_ducha": "a round chrome shower head with many small water nozzles",
 "sarro": "close-up of a shower head nozzle face covered in white limescale deposits",
 "bisagra": "a metal door hinge with its screws, mounted on the edge of a wooden door",
 "cola": "a white bottle of PVA wood glue with a nozzle, a small drop of white glue",
 "lija": "a sheet of sandpaper wrapped around a small wooden sanding block",
 "termica": "an open home electrical panel with a row of small circuit breaker switches",
 "buscapolo": "a voltage tester screwdriver with a transparent handle and a small neon light inside",
 "frente_enchufe": "a white wall power outlet with its front cover plate removed, showing the socket mechanism behind",
 "portalamparas": "an empty ceramic light bulb socket hanging from a ceiling cord",
 "rosca": "two LED light bulbs side by side, one with a large E27 screw base and one with a small E14 screw base",
 "rueditas": "a black plastic office chair caster wheel with its metal stem, next to the chair base",
 "eje": "close-up of a caster wheel axle with hair and lint tangled around it",
 "lubricante": "a blue and yellow spray can of multi-purpose lubricant with a thin red straw nozzle",
 "trincheta": "a yellow utility knife with a retractable snap-off blade",
 "guias": "a pair of metal drawer slide rails mounted inside a wooden cabinet",
 "silicona_aer": "a white spray can of silicone lubricant spray",
 "allen": "a set of L-shaped hexagonal Allen keys of different sizes fanned out",
 "regaton": "round felt furniture pads and rubber leg caps, one stuck under a wooden chair leg",
 "escuadra": "a small metal L-shaped corner bracket with screw holes and screws",
 "nivel": "a spirit level tool with a green bubble vial centered",
 "mecha": "a masonry drill bit with a wide carbide tip, next to a drill",
 "taladro": "a cordless electric drill with a drill bit attached",
 "tarugo": "several grey plastic wall plugs next to matching screws",
 "sopapa": "a rubber toilet plunger with a wooden handle",
 "pistola": "a caulking gun loaded with a white silicone cartridge",
 "cinta_papel": "a roll of beige masking tape",
 "junta_bano": "close-up of the joint line between a white bathtub edge and wall tiles, sealed with white silicone",
 "burlete": "a roll of self-adhesive rubber weather stripping, partly unrolled",
 "grafito": "a small squeeze tube of graphite powder lubricant next to a keyhole",
 "pestillo": "the metal latch bolt sticking out from the edge of a door next to the handle",
 "enduido": "an open tub of white wall filler paste with a putty knife",
 "espatula": "a metal putty knife with a wooden handle",
 "filtro_lav": "the small round drain pump filter at the bottom front of a front-loading washing machine, its access door open",
 "aireador": "a small chrome tap aerator unscrewed, showing its metal mesh screen",
 "enrollador": "a wall-mounted roller shutter strap winder box with its cover off, the strap coiled inside",
 "cinta_persiana": "a beige fabric roller shutter strap coming out of a wall winder",
 "tablillas": "close-up of horizontal plastic roller shutter slats",
 "destornillador": "two screwdrivers side by side, one with a cross Phillips tip and one with a flat tip",
 "filtro_aire": "an open wall-mounted split air conditioner indoor unit with its front cover lifted, showing two thin grey plastic mesh dust filters being slid out",
 "unidad_interior": "a white wall-mounted split air conditioner indoor unit high on a living room wall, with its louvers open",
 "unidad_exterior": "an outdoor air conditioner condenser unit with a large round fan grille, mounted on a balcony wall bracket",
 "aletas_aire": "close-up of the horizontal and vertical air-directing louvers at the bottom outlet of a split air conditioner",
 "desagote_aire": "a thin flexible white drain hose coming out from under a split air conditioner and running down an outside wall, dripping water",
 "serpentina_aire": "the thin aluminium cooling fins of an air conditioner evaporator coil seen behind removed filters inside an open split unit",
 "control_remoto": "a white air conditioner remote control with an LCD screen showing a snowflake cooling mode icon",
 "filtro_campana": "a greasy metal mesh grease filter being removed from underneath a stainless steel kitchen range hood",
 "filtro_agua": "an under-sink water purifier with a transparent housing and a white replaceable filter cartridge, connected to the kitchen water pipe",
 "filtro_aspiradora": "a pleated dust filter and foam filter removed from a bagless vacuum cleaner next to its open dust container",
 "filtro_lavavajillas": "the cylindrical mesh filter at the bottom of an open dishwasher, being unscrewed by a hand after removing the lower rack",
 "rejilla_vent": "a white metal ventilation grille set into a kitchen wall near the floor",
 "manija_puerta": "a metal lever door handle on an interior wooden door, with its round rose plate and a small grub screw visible on the side",
 "manija_ventana": "a white aluminium casement window handle turned to the open position",
 "manija_mueble": "a wooden drawer front with a metal bar pull handle, the drawer open showing the screw heads inside",
 "junta_ceramica": "close-up of white square bathroom wall tiles with grout lines between them, some grout darkened, and a small rubber grout float",
 "burlete_heladera": "the magnetic rubber door gasket around the edge of an open refrigerator door, close-up",
 "fuelle_lav": "the grey rubber door seal bellows around the round opening of a front-loading washing machine, folded back to show the inside crease",
 "rodillo_pintura": "a paint roller with a wool sleeve and a handle, resting on a plastic paint tray with white paint",
 "flotante_tanque": "a float valve with a white plastic ball float inside a black water storage tank, seen from the open lid",
 "bisagra_mueble": "a concealed cup hinge on the inside of an open white kitchen cabinet door, showing its adjustment screws",
 "rueda_ventana": "small nylon sliding window rollers in the bottom edge of an aluminium sliding window sash, lifted out of its track",
 "riel_corrediza": "close-up of the bottom aluminium track of a sliding window with dust in the channel",
 "riel_cortina": "a white ceiling-mounted curtain track with small gliders holding fabric curtains",
 "tarugo_madera": "several fluted wooden dowel pins next to a piece of wood with matching drilled holes and a bottle of white wood glue",
 "zapatilla_canilla": "a small brass tap washer holder with a black rubber washer, next to the disassembled tap headgear",
 "zapatilla_elec": "a white power strip with several sockets and an on-off switch, plugged into a wall outlet",
 "cartucho_mono": "a ceramic disc cartridge removed from a single-lever mixer tap, shown next to the tap body",
 "cartucho_silicona": "a white tube cartridge of sanitary silicone sealant with its nozzle cut at an angle",
 "pulsador": "a dual flush push button on top of a white toilet cistern",
 "valvula_descarga": "the flush valve with a rubber flapper at the bottom of an open toilet cistern full of water",
 "flexible": "a braided stainless steel flexible water connector hose connecting a wall shut-off valve to a tap under a sink",
 "tapon": "a chrome pop-up drain plug in the bottom of a white bathroom washbasin, slightly raised",
 "sonda": "a coiled steel plumbing drain snake with a hand crank",
 "vastago": "a brass tap headgear spindle unscrewed from a tap, with its rubber washer at the tip",
 "interruptor": "a white wall light switch plate with a single rocker switch",
 "disyuntor": "a residual current device switch with a T test button in a home electrical panel next to circuit breakers",
 "ficha": "an Argentine three flat pin electrical plug at the end of a white cable",
 "cinta_aisladora": "a roll of black electrical insulating tape",
 "lamparita": "a white LED light bulb with an E27 screw base",
 "cilindro": "a brass euro profile lock cylinder with two keys, removed from a door lock",
 "marco": "a wooden interior door frame with hinges and a strike plate, door slightly open",
 "marco_ventana": "an aluminium window frame around a closed glass window, seen from inside",
 "felpa": "a strip of grey pile weatherstripping brush inserted into the edge of an aluminium sliding window",
 "pincel": "a flat paintbrush with natural bristles and a wooden handle",
 "bandeja_pintura": "a black plastic paint tray with a ribbed ramp, holding white paint",
 "latex": "a white bucket of interior latex wall paint with its lid open",
 "fijador": "a can of clear primer sealer next to a wall partially painted with a roller",
 "masilla_madera": "a small tub of wood filler putty and a putty knife filling a hole in a wooden surface",
 "zocalo": "a white wooden skirting board along the bottom of a wall meeting a wooden floor",
 "excentrico": "a round metal cam lock connector in a white melamine furniture panel with its matching bolt",
 "sargento": "an F-clamp holding two glued pieces of wood together",
 "bomba_lav": "the drain pump at the bottom of a washing machine, visible through the open filter access panel",
 "manguera_lav": "the back of a washing machine showing a grey corrugated drain hose and a water inlet hose connected to a tap",
 "patas_niveladoras": "an adjustable threaded levelling foot under the corner of a white washing machine",
 "desagote_heladera": "the small drain hole at the back inside wall of a refrigerator above the vegetable drawers",
 "serpentina_heladera": "the black condenser coil grid on the back of a refrigerator pulled away from the wall",
 "pinza": "a pair of combination pliers with red insulated handles",
 "pico_loro": "a pair of tongue and groove slip-joint pliers with blue handles",
 "martillo": "a claw hammer with a wooden handle",
 "cinta_metrica": "a yellow retractable tape measure partially extended",
 "guantes": "a pair of yellow rubber household gloves next to a pair of work gloves",
 "escalera": "an aluminium household step ladder fully opened",
 "vinagre": "a clear bottle of white vinegar next to a bowl with a shower head soaking",
 "bicarbonato": "a small box of baking soda powder with a spoon",
 "arandela": "several flat metal washers and rubber washers of different sizes",
 "barral": "a metal curtain rod mounted on two wall brackets above a window",
 "hidrofugo": "a plastic jug of liquid waterproofing additive next to a bucket of mortar",
 "canilla_doble": "a chrome two-handle basin mixer tap with separate hot and cold cross handles",
 "monocomando": "a modern chrome single-lever mixer tap",
 "canilla_cocina": "a tall chrome kitchen sink faucet with a high swivel spout",
 "canilla_servicio": "a simple brass wall tap with a threaded hose outlet",
 "canilla_jardin": "an outdoor garden tap on a brick wall with a green hose attached",
 "pico_canilla": "close-up of the curved spout of a chrome tap with water flowing",
 "campana_canilla": "a chrome bell-shaped cover of a tap mechanism removed and placed beside the tap",
 "mezcladora_ducha": "a chrome shower mixer valve set with two handles on a tiled wall",
 "transferencia": "a chrome bathtub mixer with a pull-up diverter knob on the spout",
 "brazo_ducha": "a chrome shower arm coming out of a tiled wall holding a round shower head",
 "ducha_telefono": "a chrome handheld shower head with a flexible metal hose",
 "manguera_ducha": "a coiled stainless steel shower hose",
 "llave_esferica": "a brass quarter-turn ball valve with a red lever handle on a pipe",
 "llave_paso_valvula": "a round chrome shut-off valve handle set in a bathroom wall",
 "llave_escuadra": "a small chrome angle stop valve under a sink with a braided hose attached",
 "sifon_botella": "a chrome bottle trap under a bathroom washbasin",
 "sifon_cocina": "a white plastic double kitchen sink trap with curved pipes",
 "valvula_desague": "a chrome sink drain waste with a grid strainer",
 "desague_banera": "a bathtub drain with a chrome strainer and hair caught in it",
 "cano_pvc": "grey PVC drain pipes and fittings",
 "codo": "a white PVC 90 degree pipe elbow fitting",
 "cupla": "a brass straight pipe coupling fitting",
 "union_doble": "a brass pipe union fitting with a central hex nut",
 "te_cano": "a white PVC tee pipe fitting",
 "niple": "a short brass threaded pipe nipple",
 "buje_reduccion": "a brass threaded reducing bushing fitting",
 "tapon_rosca": "a brass threaded pipe plug",
 "abrazadera": "a stainless steel worm-gear hose clamp",
 "sellador_roscas": "a small tube of thread sealant paste next to a threaded brass fitting",
 "cinta_autosoldable": "a roll of black self-fusing silicone rubber tape wrapped around a pipe",
 "pegamento_pvc": "a small can of PVC pipe cement with an applicator brush",
 "inodoro": "a white ceramic toilet with closed lid",
 "mochila_colgar": "a white high-level wall-mounted toilet cistern with a pull chain",
 "cisterna_embutida": "a wall-mounted dual flush plate of a concealed toilet cistern",
 "valvula_entrada": "a plastic toilet cistern fill valve with a float",
 "sapito": "a red rubber toilet flapper valve",
 "cadena_inodoro": "a small metal chain attached to a toilet flapper inside a cistern",
 "palanca_mochila": "a chrome toilet tank flush lever handle",
 "conexion_inodoro": "a white rubber toilet pan connector sleeve",
 "tapa_inodoro": "a white toilet seat with lid",
 "bisagra_tapa": "chrome toilet seat hinges with long bolts",
 "bulones_inodoro": "toilet floor fixing bolts with white caps",
 "destapador_inodoro": "a black rubber toilet plunger with a bellows cup",
 "bidet": "a white ceramic bidet with a chrome mixer",
 "ducha_bidet": "close-up of the chrome spray nozzle inside a bidet bowl",
 "lavatorio": "a white ceramic pedestal washbasin",
 "banera": "a white built-in bathtub with chrome taps",
 "mampara": "a glass shower screen panel on a bathtub",
 "plato_ducha": "a white square shower tray with a central drain",
 "botiquin": "a white bathroom mirror cabinet",
 "toallero": "a chrome towel bar on a tiled wall",
 "portarrollos": "a chrome toilet paper holder with a roll",
 "extractor_bano": "a white bathroom exhaust fan grille on a wall",
 "cortina_bano": "a plain shower curtain hanging from a rod",
 "espejo": "a round wall mirror",
 "pileta_cocina": "a stainless steel double kitchen sink on a countertop",
 "bajo_mesada": "an open kitchen under-sink cabinet showing pipes and a trap",
 "mesada": "a granite kitchen countertop with a sink",
 "canilla_extensible": "a chrome kitchen faucet with a pull-out spray head extended",
 "lavavajillas": "a stainless steel dishwasher with the door open and racks",
 "brazo_aspersor": "the rotating plastic spray arm at the bottom of an open dishwasher",
 "lavarropas": "a white front-loading washing machine",
 "tambor_lav": "the stainless steel perforated drum inside a front-loading washing machine",
 "cajon_jabon": "the pulled-out detergent drawer of a washing machine with compartments",
 "secarropas": "a white tumble dryer",
 "filtro_pelusa": "a lint filter full of grey lint pulled out of a tumble dryer",
 "heladera": "a modern white two-door refrigerator",
 "lampara_heladera": "a small appliance light bulb inside a refrigerator behind a clear cover",
 "perilla_termostato": "a refrigerator thermostat dial knob inside the fridge",
 "bandeja_deshielo": "a plastic drip tray under the back of a refrigerator",
 "freezer": "an open chest freezer",
 "microondas": "a modern microwave oven",
 "horno_electrico": "a countertop electric toaster oven",
 "campana_cocina": "a stainless steel kitchen range hood above a cooktop",
 "tanque_agua": "a black plastic rooftop water storage tank",
 "colector": "a water tank outlet manifold with several brass valves",
 "bomba_presurizadora": "a small blue water pressure booster pump",
 "bomba_elevadora": "a centrifugal water pump connected to pipes",
 "automatico_tanque": "an electric float level switch with a cable",
 "valvula_retencion": "a brass check valve with an arrow",
 "filtro_sedimentos": "a clear housing water sediment filter with a white cartridge",
 "termotanque": "a white standing water heater tank",
 "termotanque_electrico": "a white wall-mounted electric water heater",
 "valvula_seguridad": "a brass pressure relief valve on a water heater pipe",
 "calefon": "a white wall-mounted gas tankless water heater",
 "llave_gas": "a yellow-handled gas shut-off valve on a pipe",
 "flexible_gas": "a yellow-labeled corrugated steel gas connector hose",
 "regulador_garrafa": "a gas cylinder pressure regulator with a hose",
 "garrafa": "a blue steel LPG gas cylinder",
 "piloto": "a small blue pilot flame inside a gas appliance window",
 "quemador": "a gas stove burner with an even blue flame",
 "perilla_cocina": "black gas stove control knobs",
 "anafe": "a four-burner gas cooktop built into a countertop",
 "cocina_gas": "a white freestanding gas cooker with oven",
 "estufa_tiro": "a white wall-mounted balanced flue gas heater",
 "conducto_evacuacion": "a metal flue pipe rising from a wall-mounted gas water heater",
 "sombrerete": "a metal chimney flue cap on a roof",
 "detector_monoxido": "a white carbon monoxide alarm detector",
 "medidor_gas": "a domestic gas meter with a yellow pipe and valve",
 "tablero": "an open home electrical panel with a row of circuit breakers",
 "fusible": "an old ceramic screw-in electrical fuse",
 "toma_corriente": "a white Argentine three-pin wall power socket",
 "toma_20a": "a white heavy-duty 20 amp wall socket with larger flat pins",
 "toma_doble": "a white double wall power socket",
 "tecla_combinada": "two white light switches at both ends of a hallway",
 "modulo_electrico": "a single white modular light switch module",
 "bastidor": "a plastic wall switch mounting frame with modules",
 "caja_electrica": "an empty rectangular electrical box embedded in a wall",
 "plafon": "a round white LED ceiling light fixture",
 "aplique": "a modern wall light fixture with a warm glow",
 "lampara_e14": "a small candle-shaped LED light bulb with a small screw base",
 "dicroica": "a GU10 LED spotlight bulb",
 "tubo_led": "a long white LED tube light",
 "cable_unipolar": "coils of red, blue and green-yellow single electrical wires",
 "cable_taller": "a coil of white flexible multi-core power cable",
 "ficha_hembra": "a white female power cable connector socket",
 "adaptador": "a white plug adapter for different pin types",
 "conector_empalme": "a small transparent lever wire connector with three cables",
 "multimetro": "a yellow digital multimeter with probes",
 "timbre": "a white wall-mounted doorbell chime unit",
 "pulsador_timbre": "a doorbell push button next to a front door",
 "portero": "a white wall-mounted intercom handset",
 "sensor_movimiento": "a white PIR motion sensor mounted on a wall",
 "fotocelula": "a small outdoor photocell light sensor",
 "reflector": "a black LED floodlight mounted on an outdoor wall",
 "ventilador_techo": "a white ceiling fan with four blades and a light",
 "dimmer": "a white rotary light dimmer switch on a wall",
 "toma_usb": "a white wall socket module with two USB charging ports",
 "prolongador": "a white extension cord with a single socket",
 "estufa_electrica": "a modern white electric panel heater",
 "caloventor": "a small portable electric fan heater",
 "radiador": "a white panel radiator under a window",
 "purgador": "close-up of a radiator bleed valve with a small key",
 "llave_radiador": "a white thermostatic radiator valve knob",
 "caldera": "a white wall-mounted combination gas boiler",
 "termostato_ambiente": "a white digital room thermostat on a wall",
 "ventilador_pie": "a white standing electric fan",
 "soporte_aire": "metal wall brackets holding an outdoor air conditioner unit",
 "canos_cobre": "insulated copper refrigerant pipes connecting an air conditioner",
 "deshumidificador": "a white portable dehumidifier",
 "cerradura": "a door mortise lock with a key in the cylinder",
 "cerradura_embutir": "a steel mortise lock body removed from a door",
 "cerrojo": "a brass deadbolt lock on a wooden door",
 "pasador": "a small metal sliding door bolt",
 "cerradero": "a metal door strike plate on a wooden door frame",
 "llave_puerta": "a brass door key",
 "tope_puerta": "a stainless steel floor door stopper with a rubber cap",
 "cierrapuertas": "a silver hydraulic door closer arm mounted on top of a door",
 "mirilla": "a brass door peephole viewer",
 "barredor": "a door bottom draft stopper strip with a brush",
 "cadena_seguridad": "a brass door security chain",
 "bisagra_municion": "a brass ball bearing door hinge",
 "puerta_corrediza": "a white sliding wardrobe door on a track",
 "porton": "a dark grey sliding metal garage gate",
 "motor_porton": "a sliding gate motor unit beside a metal gate",
 "ventana_corrediza": "an aluminium sliding window with two glass panels",
 "ventana_batiente": "an open white casement window",
 "banderola": "a small top-hung tilt window open at an angle",
 "persiana": "a white roller shutter half closed over a window",
 "cajon_persiana": "an open roller shutter box above a window showing the roller",
 "manivela": "a white crank handle for a roller shutter",
 "topes_persiana": "white plastic stoppers on the bottom slat of a roller shutter",
 "vidrio": "a clear glass window pane",
 "contravidrio": "aluminium glazing beads around a window glass",
 "masilla_vidrio": "grey glazing putty being smoothed around a window pane",
 "mosquitero": "a window insect screen with fine grey mesh",
 "tela_mosquitero": "a roll of grey fiberglass insect screen mesh",
 "cremona": "a white window espagnolette handle mechanism",
 "cortina_roller": "a white fabric roller blind half lowered on a window",
 "cadena_roller": "a white plastic bead chain of a roller blind",
 "soporte_barral": "a metal curtain rod bracket on a wall",
 "deslizador": "plastic curtain rail gliders and hooks",
 "guias_telescopicas": "a pair of metal telescopic ball-bearing drawer slides",
 "perilla_mueble": "a round brushed metal cabinet knob",
 "tornillo_madera": "several wood screws of different sizes",
 "tornillo": "a handful of assorted screws",
 "clavo": "a small pile of steel nails",
 "piston_silla": "a black office chair gas lift cylinder",
 "base_estrella": "a black five-star office chair base with casters",
 "tablillas_cama": "curved wooden bed slats in a bed frame",
 "soporte_estante": "a pair of white metal shelf brackets on a wall",
 "repisa": "a wooden wall shelf with books",
 "patas_mueble": "adjustable plastic cabinet legs",
 "placard": "a white wardrobe with sliding doors",
 "puerta_mueble": "a white kitchen cabinet door slightly open",
 "cajon": "an open wooden drawer",
 "lustramuebles": "a spray can of furniture polish and a cloth",
 "tarugo_durlock": "metal hollow wall anchors for plasterboard",
 "gancho_cuadro": "brass picture hanging hooks with pins",
 "durlock": "a plasterboard drywall panel",
 "cinta_durlock": "a roll of paper drywall joint tape",
 "masilla": "a tub of white wall filler with a putty knife",
 "esmalte": "a can of glossy enamel paint and a brush",
 "aguarras": "a metal can of mineral spirits",
 "pintura_antihongo": "a bucket of anti-mold interior paint",
 "membrana_liquida": "a bucket of white liquid waterproofing membrane with a roller",
 "membrana": "a roll of asphalt waterproofing membrane on a roof",
 "revoque": "a wall with cracked plaster revealing bricks underneath",
 "cemento": "a paper bag of cement next to a pile of sand",
 "arena": "a small pile of construction sand",
 "ladrillo": "a stack of red clay bricks",
 "ceramico": "square ceramic floor tiles",
 "pegamento_ceramico": "a bag of tile adhesive mortar with a notched trowel",
 "llana": "a steel notched trowel",
 "cuchara_albanil": "a pointed brick trowel with a wooden handle",
 "fratacho": "a wooden plastering float",
 "plomada": "a brass plumb bob hanging on a string",
 "guardacanto": "an aluminium corner bead on a wall corner",
 "espuma_poliuretano": "a can of expanding polyurethane foam",
 "sellador_acrilico": "a white tube of acrylic sealant",
 "canaleta": "a grey rain gutter along a roof edge",
 "bajada_pluvial": "a vertical downspout pipe on an outside wall",
 "embudo_pluvial": "a roof terrace drain outlet with a grate",
 "rejilla_balcon": "a small square drain grate on a balcony floor",
 "teja": "terracotta roof tiles",
 "chapa": "corrugated metal roof sheets",
 "manguera_jardin": "a green coiled garden hose",
 "acople_rapido": "plastic quick hose connectors",
 "aspersor_jardin": "a garden lawn sprinkler spraying water",
 "pileta_natacion": "a small backyard swimming pool",
 "reja": "a black wrought iron window grille",
 "buzon": "a metal wall-mounted mailbox",
 "destornillador_plano": "a flat head screwdriver",
 "destornillador_phillips": "a Phillips cross head screwdriver",
 "atornillador": "a cordless electric screwdriver drill",
 "llave_tubo": "a chrome socket wrench set",
 "llave_stillson": "a red pipe wrench",
 "llave_combinada": "a chrome combination wrench",
 "alicate": "a pair of diagonal cutting pliers",
 "serrucho": "a hand saw for wood",
 "sierra_metal": "a hacksaw with a blue frame",
 "caladora": "an electric jigsaw",
 "amoladora": "an angle grinder",
 "mecha_madera": "a set of wood drill bits with brad points",
 "mecha_metal": "a set of HSS metal drill bits",
 "cepillo_alambre": "a wire brush with a wooden handle",
 "aceitera": "a small oil can with a long spout",
 "antiparras": "a pair of clear safety goggles",
 "barbijo": "a white dust mask",
 "pistola_calor": "a heat gun",
 "cuter": "a yellow utility knife with a snap-off blade",
 "escuadra_carpintero": "a metal carpenter square",
 "lapiz_carpintero": "a flat red carpenter pencil",
 "detector_cables": "a handheld wall stud and wire detector",
 "detergente": "a bottle of dish soap",
 "desengrasante": "a spray bottle of kitchen degreaser",
 "destapacanerias": "a bottle of liquid drain cleaner",
 "antisarro": "a spray bottle of limescale remover",
 "alcohol": "a bottle of rubbing alcohol",
 "esponja": "a yellow and green cleaning sponge",
 "rociador": "an empty white plastic spray bottle",
 "trapo": "a stack of cotton cleaning cloths",
 "bolsa_residuos": "a roll of black garbage bags",
 "pegamento_contacto": "a small can of contact adhesive",
 "adhesivo_epoxi": "a two-part epoxy adhesive syringe",
 "cinta_doble_faz": "a roll of double-sided mounting tape",
 "precintos": "a bundle of black plastic cable ties",
 "matafuego": "a red ABC fire extinguisher",
 "detector_humo": "a white ceiling smoke detector",
 "botiquin_primeros": "a red first aid kit box",
 "linterna_emergencia": "a white rechargeable emergency light on a wall",
 "piso_flotante": "laminate floating floor planks clicking together",
 "parquet": "a herringbone wooden parquet floor",
 "piso_vinilico": "vinyl plank flooring samples",
 "porcelanato": "large grey porcelain floor tiles",
 "zocalo_flotante": "white MDF skirting board pieces",
 "manta_piso": "a roll of foam underlayment for laminate floors",
 "alfombra": "a beige carpet rug corner",
 "plastificador": "a can of clear wood floor varnish",
 "cera_pisos": "a bottle of liquid floor wax",
 "umbral": "a metal floor transition threshold strip",
 "baldosa": "patterned cement floor tiles",
 "extractor_cocina": "a wall-mounted kitchen exhaust fan",
 "filtro_carbon": "a round activated carbon filter for a range hood",
 "alacena": "wall-mounted kitchen cabinets",
 "rejilla_cocina": "a cast iron gas stove grate",
 "horno_cocina": "an open gas oven with racks",
 "bandeja_horno": "a black metal oven baking tray",
 "grifo_filtro": "a countertop water purifier tap",
 "dispenser_agua": "a water cooler dispenser with a bottle",
 "aspiradora": "a canister vacuum cleaner",
 "bolsa_aspiradora": "a vacuum cleaner dust bag",
 "plancha": "a steam iron",
 "pava_electrica": "an electric kettle",
 "cafetera": "a drip coffee maker",
 "tostadora": "a chrome two-slot toaster",
 "licuadora": "a kitchen blender",
 "secador_pelo": "a hair dryer",
 "televisor": "a flat screen television",
 "soporte_tv": "a wall TV mounting bracket",
 "router": "a home wifi router with antennas",
 "control_tv": "a TV remote control",
 "pilas": "AA and AAA batteries",
 "estufa_halogena": "a halogen space heater",
 "panel_calefactor": "a slim wall mounted electric heating panel",
 "iman_mueble": "a small magnetic cabinet door catch",
 "piston_mueble": "a gas lift strut for kitchen cabinet doors",
 "cerradura_mueble": "a small cabinet drawer lock with keys",
 "silla": "a wooden dining chair",
 "mesa": "a wooden dining table",
 "cama": "a wooden bed frame",
 "sommier": "a box spring bed base",
 "colchon": "a white mattress",
 "biblioteca": "a wooden bookshelf",
 "escritorio": "a simple wooden desk",
 "sillon": "a grey fabric sofa",
 "espejo_pared": "a round wall mirror",
 "perchero": "a wall coat rack with hooks",
 "barral_placard": "a chrome closet rod with brackets",
 "bocallave": "a brass door keyhole escutcheon",
 "roseta": "a round door handle rose plate",
 "contramarco": "wooden door casing molding",
 "hoja_puerta": "a plain white interior door leaf",
 "cerradura_electrica": "an electric door strike lock",
 "manijon": "a long stainless steel door pull handle",
 "burlete_ventana": "a self-adhesive window weather strip",
 "policarbonato": "a clear polycarbonate sheet",
 "film_ventana": "frosted privacy film being applied to a window",
 "toldo": "a striped retractable awning",
 "cortina_tela": "light grey fabric curtains hanging from a rod",
 "argollas_cortina": "metal curtain rings on a rod",
 "yeso": "a bag of plaster powder and a mixing bowl",
 "sellador_fisuras": "a cartridge of acrylic crack filler",
 "malla_fibra": "a roll of fiberglass mesh tape",
 "membrana_pintura": "a bucket of waterproof wall paint",
 "removedor": "a can of paint stripper",
 "convertidor": "a can of rust converter primer",
 "sellador_pared": "a bucket of wall primer sealer",
 "moldura": "white decorative ceiling crown molding",
 "cielorraso": "a white plasterboard ceiling with a light",
 "azulejo": "white ceramic wall tiles",
 "perfil_durlock": "galvanized steel drywall studs",
 "tornillo_durlock": "black drywall screws",
 "pelacables": "a wire stripper tool",
 "tenaza": "carpenter pincers",
 "formon": "a wood chisel",
 "cincel": "a cold chisel",
 "maza": "a rubber mallet",
 "prensa": "a quick grip bar clamp",
 "lijadora": "an electric orbital sander",
 "sierra_copa": "a hole saw drill attachment",
 "soldador": "a soldering iron with a stand",
 "balde": "a plastic bucket",
 "pala": "a garden shovel",
 "rastrillo": "a garden leaf rake",
 "tijera_podar": "garden pruning shears",
 "cortadora_cesped": "a lawn mower",
 "bordeadora": "a string trimmer",
 "maceta": "a terracotta flower pot",
 "parrilla": "a brick barbecue grill",
 "tornillo_autoperforante": "self-drilling metal screws",
 "bulon": "hex bolts with nuts",
 "taco_quimico": "a chemical anchor resin cartridge",
 "sellador_poliuretanico": "a cartridge of polyurethane sealant",
 "silicona_sanitaria": "a white cartridge of sanitary silicone",
 "cinta_teflon_gas": "a roll of yellow gas thread tape",
 "grasa": "a tube of lithium grease",
 "removedor_sarro": "a bottle of white cleaning vinegar",
 "cepillo_limpieza": "a stiff bristle cleaning brush",
 "secador_piso": "a floor squeegee",
 "lampazo": "a mop and bucket",
 "alarma": "a home alarm keypad on a wall",
 "camara_seguridad": "a white home security camera",
 "cerradura_digital": "a digital keypad door lock",
 "llave_corte_general": "a main water shut-off valve near a water meter",
 "medidor_agua": "a water meter in a ground box",
 "tapa_tanque": "a plastic water tank lid",
 "ablandador": "a home water softener unit",
 "camara_inspeccion": "a concrete sewer inspection chamber with a lid",
 "pileta_patio": "a floor drain trap box with a grate",
 "ventilacion_cloacal": "a PVC vent pipe on a roof",
 "asiento_inodoro": "a white toilet seat",
 "pileta_lavadero": "a deep laundry utility sink",
 "jabonera": "a chrome wall soap dish",
 "barral_ducha": "a chrome shower curtain rod",
 "agarradera": "a stainless steel bathroom grab bar"
};

const { proteger, firmaValida } = require('./_seguridad');
const PERMITIDOS = new Set(['t', 'g', 'i', 'p', 's', 'v', 'r', 'k']);

// ---------- Catálogo fijo de la app (rubros, Mi casa, herramientas, arreglos de temporada) ----------
// Cada imagen tiene una descripción y una semilla fijas: siempre sale la misma y queda guardada en la CDN.
const KSTYLE = 'Premium mobile app illustration: a single subject as a soft 3D render with matte clay-like material, gently rounded forms, ' +
  'soft studio lighting with a subtle contact shadow, centered with generous margins on a plain warm off-white background (#F5F7F2). ' +
  'Color palette drawn from deep forest green (#26573F), soft mint green (#B1D8B7), warm amber (#F2B33D), white and light warm greys. ' +
  'Realistic, recognizable object shapes, clean and minimal, cohesive icon-set look. ' +
  'Absolutely no text, no letters, no numbers, no logos, no watermark, no people, no hands, no faces.';
const K = {
  r_plomeria: 'a chrome kitchen faucet with a single water drop falling, and a curved white sink drain pipe beside it',
  r_gas: 'a white wall-mounted gas water heater with a small window showing a blue flame at the bottom',
  r_electricidad: 'a white wall power socket plate and a light switch plate side by side, with a short coiled cable',
  r_carpinteria: 'a small wooden chair next to a wooden plank, with a claw hammer resting on the plank',
  r_albanileria: 'a small neat stack of terracotta bricks with a mason trowel resting on top',
  r_mant: 'a small cozy house model with a forest green roof and a little amber toolbox beside it',
  c_temporada: 'a small cozy house model with a forest green roof under a soft round sun, a few mint leaves floating around it',
  c_herramientas: 'an open forest green toolbox with a screwdriver, an adjustable wrench and pliers inside',
  c_ferreterias: 'a small hardware shop storefront with an amber striped awning and a forest green map pin floating above it',
  k_destornilladores: 'two screwdrivers crossed, one flat head and one Phillips, with forest green and amber handles',
  k_llave: 'an adjustable wrench lying diagonally',
  k_pinza: 'a pair of combination pliers with mint green handles',
  k_teflon: 'a small roll of white PTFE plumber tape',
  k_buscapolo: 'a slim voltage tester screwdriver with a transparent handle and a tiny glowing amber light',
  k_metro: 'an amber retractable tape measure with the metal tape partly pulled out',
  k_linterna: 'a small forest green flashlight with a soft beam of light',
  k_balde: 'a mint green plastic bucket with a folded cloth hanging over its edge',
  s_aa: 'a white wall split air conditioner with its two thin mesh dust filters taken out and placed in front of it',
  s_sil: 'the corner of a white bathtub against tiles, with a fresh clean line of white silicone sealant',
  s_desag: 'a small square balcony floor drain grate with a few dry leaves around it',
  s_rej: 'a round chrome floor drain grate set in light bathroom tiles',
  s_mosq: 'a window with a fine mosquito net screen in an aluminium frame',
  s_tanque: 'a black plastic rooftop water storage tank with its round lid open',
  s_gas: 'a white wall gas water heater next to a small gas room heater with a blue flame',
  s_burl: 'a window frame with a soft grey foam weatherstrip being placed along its edge',
  s_hojas: 'a roof rain gutter filled with orange and brown autumn leaves',
  s_vent: 'a slightly open window with soft curtains moving in the breeze',
  s_hong: 'a white ceiling corner with dark grey mold spots and a spray bottle below it',
  s_term: 'a small home electrical panel with a row of circuit breakers and one residual current switch with a test button'
};

module.exports = async (req, res) => {
  const acct = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    if (!(await proteger(req, res, 'img'))) return;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    if (!acct || !token) return res.status(501).json({ ok: false, error: 'sin_configurar' });
    if (body.mode !== 'prompts') return res.status(400).json({ ok: false, error: 'Modo inválido' });
    const pasos = Array.isArray(body.pasos) ? body.pasos.slice(0, 8).map(x => String(x).slice(0, 240)) : [];
    const caso = String(body.caso || '').slice(0, 120);
    try { return res.status(200).json({ ok: true, prompts: await describe(caso, pasos) }); }
    catch (e) { return res.status(200).json({ ok: true, prompts: pasos.map(p => `${caso}: ${p}`) }); }
  }

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  if (!acct || !token) { res.setHeader('Cache-Control', 'no-store'); return res.status(501).json({ ok: false, error: 'sin_configurar' }); }

  const q = req.query || {};
  const no = msg => { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ ok: false, error: msg }); };
  // Solo se aceptan las direcciones que arma la app: así nadie puede saltear la caché con parámetros inventados
  if (Object.keys(q).some(k => !PERMITIDOS.has(k) || Array.isArray(q[k]))) return no('Parámetro inválido');
  if (q.v !== undefined && !['3', '4', '5'].includes(q.v)) return no('Versión inválida');
  if (q.r !== undefined && q.r !== '1') return no('Parámetro inválido');
  if (q.g !== undefined && !/^\d{1,2}$/.test(String(q.i || ''))) return no('Paso inválido');
  if (q.p !== undefined && (String(q.p).length > 400 || !firmaValida(String(q.p), q.s))) return no('Imagen no autorizada');
  if (!(require('./_seguridad').origenValido(req))) return no('Origen no permitido');
  let subject = '';
  if (q.k) subject = K[String(q.k)] || '';
  else if (q.t) subject = T[String(q.t)] ? 'Identification picture of ' + T[String(q.t)] + ', shown clearly so a beginner can recognize it' : '';
  else if (q.g) { const list = P[String(q.g)]; const i = parseInt(q.i, 10); subject = list && list[i]; }
  else if (q.p) subject = 'Identification picture of ' + String(q.p).slice(0, 400) + ', shown clearly so a beginner can recognize it';
  if (!subject) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ ok: false, error: 'Paso desconocido' }); }

  const prompt = `${subject}. ${q.k ? KSTYLE : STYLE}`;
  // Guardado permanente (Supabase Storage): cada imagen se genera una sola vez en la vida de la app.
  // Si ya existe, se redirige al archivo guardado, que carga al instante.
  const sbUrl = process.env.SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_KEY;
  const path = q.t ? `t/${String(q.t).replace(/[^\w-]/g, '_')}-v${q.v || 3}.jpg` : q.p ? `p/${seedOf(prompt)}-${String(q.p).length}.jpg` : q.k ? `k/${String(q.k).replace(/[^\w-]/g, '_')}.jpg` : '';
  const pub = sbUrl && sbKey && path ? `${sbUrl}/storage/v1/object/public/piezas/${path}` : '';
  if (pub) {
    try {
      const h = await fetch(pub, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
      if (h.ok) { res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable'); res.setHeader('Location', pub); return res.status(302).end(); }
    } catch (e) { /* si no responde, se genera igual */ }
  }
  try {
    // El catálogo usa el modelo de mejor calidad (FLUX.2 dev); si no está disponible, el habitual
    // Siempre el modelo económico: el de más calidad gasta el cupo gratis del día en unas pocas fotos
    // Orden: Cloudflare (klein) → si Cloudflare no tiene cupo, Pollinations (gratis, sin clave) → si no, Cloudflare (schnell)
    const t0 = Date.now(), resto = () => Math.max(4000, 27500 - (Date.now() - t0));
    let kErr = '';
    const img = await klein(acct, token, prompt, 512, 512, 14000).catch(async e => {
      kErr = String(e.message); console.error('klein:', kErr);
      const sinCupo = /neuron|allocation|quota|429|4006/i.test(kErr);
      if (sinCupo) return polli(prompt, resto()).catch(e2 => { throw new Error(kErr + ' | pollinations: ' + e2.message); });
      return schnell(acct, token, prompt).catch(e2 => polli(prompt, resto()).catch(e3 => { throw new Error(kErr + ' | ' + e2.message + ' | pollinations: ' + e3.message); }));
    });
    const isPng = img[0] === 0x89 && img[1] === 0x50;
    res.setHeader('Content-Type', isPng ? 'image/png' : 'image/jpeg');
    if (pub) {
      try {
        await fetch(`${sbUrl}/storage/v1/object/piezas/${path}`, { method: 'POST', signal: AbortSignal.timeout(4000),
          headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'content-type': isPng ? 'image/png' : 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' }, body: img });
      } catch (e) { console.error('guardar:', e.message); }
    }
    // Se guarda en la CDN de Vercel: cada imagen se genera una sola vez
    res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=31536000, immutable');
    return res.status(200).send(img);
  } catch (e) {
    console.error('Imagen:', e.message);
    res.setHeader('Cache-Control', 'no-store');
    const cupo = /neuron|allocation|quota|429|4006/i.test(String(e.message));
    return res.status(cupo ? 429 : 502).json({ ok: false, error: cupo ? 'Cloudflare y Pollinations no dejaron generar más imágenes por ahora (cupo o demasiados pedidos juntos)' : 'No se pudo generar la imagen', detalle: String(e.message).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '').slice(0, 300) });
  }
};

function seedOf(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h) % 2147483647; }

async function dev(acct, token, prompt) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', '640');
  form.append('height', '640');
  form.append('steps', '25');
  form.append('seed', String(seedOf(prompt)));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 17000);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-2-dev`, {
      method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${token}` }, body: form
    });
    return await readImage(r);
  } finally { clearTimeout(t); }
}

async function klein(acct, token, prompt, w = 768, h = 480, ms = 25000) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(w));
  form.append('height', String(h));
  form.append('seed', String(seedOf(prompt)));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`, {
      method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${token}` }, body: form
    });
    return await readImage(r);
  } finally { clearTimeout(t); }
}

// Pollinations: servicio gratis de imágenes con FLUX, sin cuenta ni clave (tiene un límite de pedidos por minuto)
async function polli(prompt, ms = 25000) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=512&height=512&model=flux&nologo=true&private=true&seed=${seedOf(prompt) % 1000000}&referrer=handygo`;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) throw new Error(String(r.status) + ' ' + (await r.text().catch(() => '')).slice(0, 120));
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 6000) throw new Error('imagen vacía');
    return buf;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'tardó demasiado' : e.message); }
  finally { clearTimeout(t); }
}

async function schnell(acct, token, prompt) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 8 })
    });
    return await readImage(r);
  } finally { clearTimeout(t); }
}

async function readImage(r) {
  const type = r.headers.get('content-type') || '';
  if (type.startsWith('image/')) { if (!r.ok) throw new Error(String(r.status)); return Buffer.from(await r.arrayBuffer()); }
  const d = await r.json().catch(() => ({}));
  const b64 = (d && d.result && d.result.image) || (d && d.image);
  if (!r.ok || !b64) throw new Error(`${r.status} ${(d.errors && d.errors[0] && d.errors[0].message) || 'sin imagen'}`);
  return Buffer.from(b64, 'base64');
}

async function describe(caso, pasos) {
  if (!process.env.GEMINI_API_KEY) throw new Error('sin gemini');
  const ask = `These are step-by-step home repair instructions in Argentine Spanish for: "${caso}".
For EACH step write ONE short English description (max 30 words) of a single instructional illustration for that step.
Focus on the OBJECT and the TOOL involved, shown clearly in close-up (show at most one hand, only if essential).
Be concrete about the everyday objects (e.g. "a black plastic caster wheel of an office chair"). No people faces, no text.
Steps:\n${pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}
Answer ONLY JSON: {"prompts":["...", "..."]} with exactly ${pasos.length} items in the same order.`;
  const models = [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'].filter(Boolean);
  for (const model of [...new Set(models)]) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 } })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      const text = ((((d.candidates || [])[0] || {}).content || {}).parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      const o = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
      if (Array.isArray(o.prompts) && o.prompts.length) return pasos.map((p, i) => String(o.prompts[i] || p).slice(0, 380));
    } catch (e) { /* probar el siguiente modelo */ } finally { clearTimeout(t); }
  }
  throw new Error('sin respuesta');
}

module.exports.PROMPTS = P;
