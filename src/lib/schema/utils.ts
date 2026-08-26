import type { ParsedSpreadsheetSheet } from "@/lib/import-export/fn"
import type { FieldDefinition, DocumentSchema, DocumentSchemaGroup, TieredOptionsSchema } from "@/lib/types"

function cloneFields(fields: FieldDefinition[]): FieldDefinition[] {
    return JSON.parse(JSON.stringify(fields)) as FieldDefinition[];
}

function cloneSubtypeFields(subtypeFields?: Record<string, FieldDefinition[]>): Record<string, FieldDefinition[]> | undefined {
    if (!subtypeFields) return undefined;
    const cloned: Record<string, FieldDefinition[]> = {};
    for (const [key, fields] of Object.entries(subtypeFields)) {
        cloned[key] = cloneFields(fields);
    }
    return cloned;
}

function createSchemaFromSheet(
    sheet: ParsedSpreadsheetSheet,
    groupId?: string,
    groupName?: string
): DocumentSchema {
    const canonicalName = sheet.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const schemaId = canonicalName || crypto.randomUUID()

    // Map headers to FieldDefinition matching FieldDataType & FieldInputType
    const fields: FieldDefinition[] = sheet.headers.map((header) => {
        const key = header.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")
        return {
            name: key || header,
            label: header,
            type: {
                data: "string",
                input: "text",
            },
            required: false,
        }
    })

    // Infer title field key or default to first column key / fallback
    const titleHeader = sheet.headers.find((h) =>
        ["title", "name", "label", "heading"].includes(h.trim().toLowerCase())
    )
    const titleField = titleHeader
        ? titleHeader.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")
        : fields[0]?.name || "title"

    return {
        id: schemaId,
        name: sheet.name,
        titleField,
        groupId,
        groupName,
        fields,
    }
}

function createSchemaFromTemplate(template: DocumentSchema, overrides?: Partial<DocumentSchema>): DocumentSchema;
function createSchemaFromTemplate(template: DocumentSchemaGroup): DocumentSchema[];

function createSchemaFromTemplate(
    template: DocumentSchema | DocumentSchemaGroup,
    overrides?: Partial<DocumentSchema>
): DocumentSchema | DocumentSchema[] {

    if ("documents" in template) {
        const idMap: Record<string, string> = {};
        template.documents.forEach((doc) => {
            idMap[doc.id] = `${doc.id}-${crypto.randomUUID()}`;
        });

        return template.documents.map((doc) => {
            const newDocId = idMap[doc.id];

            return {
                ...doc,
                id: newDocId,
                parentSchemaId: doc.parentSchemaId ? (idMap[doc.parentSchemaId] ?? doc.parentSchemaId) : undefined,
                groupId: template.id,
                groupName: template.name,
                fields: cloneFields(doc.fields),
                subtypeFields: cloneSubtypeFields(doc.subtypeFields),
            };
        });
    }

    return {
        ...template,
        ...overrides,
        id: overrides?.id ?? `${template.id}-${crypto.randomUUID()}`,
        name: overrides?.name ?? template.name,
        groupId: undefined,
        groupName: undefined,
        fields: cloneFields(overrides?.fields ?? template.fields),
        subtypeFields: cloneSubtypeFields(template.subtypeFields),
    };
}

function createSchemaGroupFromTemplate(
    template: DocumentSchemaGroup,
    overrides?: Partial<DocumentSchemaGroup>,
    options?: { preserveTemplateIds?: boolean }
): DocumentSchemaGroup {
    const preserveTemplateIds = options?.preserveTemplateIds === true;
    const groupId = overrides?.id ?? (preserveTemplateIds ? template.id : `${template.id}-${crypto.randomUUID()}`);

    const idMap: Record<string, string> = {};
    template.documents.forEach((doc) => {
        idMap[doc.id] = preserveTemplateIds ? doc.id : `${doc.id}-${crypto.randomUUID()}`;
    });

    const clonedDocuments: DocumentSchema[] = template.documents.map((doc) => {
        const newDocId = idMap[doc.id];

        return {
            ...doc,
            id: newDocId,
            parentSchemaId: doc.parentSchemaId ? (idMap[doc.parentSchemaId] ?? doc.parentSchemaId) : undefined,
            fields: cloneFields(doc.fields),
            subtypeFields: cloneSubtypeFields(doc.subtypeFields),
        };
    });

    return {
        ...template,
        ...overrides,
        id: groupId,
        name: overrides?.name ?? template.name,
        description: overrides?.description ?? template.description,
        documents: clonedDocuments,
    };
}

function buildFieldDefinitionsForParent(parentSchema?: DocumentSchema, childSchema?: DocumentSchema): FieldDefinition[] {
    const inheritedFields = parentSchema?.fields ?? []
    const childFields = childSchema?.fields ?? []
    return [
        ...inheritedFields.map((field) => ({ ...field })),
        ...childFields.map((field) => ({ ...field })),
    ]
}

const DEFAULT_SCHEMA_TEMPLATES: DocumentSchemaGroup[] = [
    {
        id: "homicide-tracking",
        name: "Homicide Tracking",
        description: "Annotate reports of homicide.",
        documents: [
            {
                id: "article",
                name: "Article",
                description: "Capture an article reporting a homicide.",
                icon: "newspaper",
                titleField: "headline",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "art-{date}-{rand:6}" }, description: "Auto-generated report identifier." },
                    { name: "headline", label: "Headline", type: { data: "string", input: "text" }, required: true },
                    {
                        name: "type_of_source",
                        label: "Source Type",
                        type: { data: "select", input: "search-select-input" },
                        specification: "source_type",
                        options: [
                            'Newspaper',
                            'Online',
                            'Television',
                            'Radio',
                            'Magazine',
                            'Blog',
                            'Social Media',
                            'Other'
                        ]
                    },
                    {
                        name: "source_url",
                        label: "Source URL",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "type_of_source",
                            operator: "eq",
                            value: "Online"
                        }
                    },
                    {
                        name: "publication_date_mode",
                        label: "Publication Date Known?",
                        type: { data: "select", input: "select" },
                        options: ["exact", "approximate", "unknown"],
                        default: "exact"
                    },
                    {
                        name: "publication_date_exact",
                        label: "Publication Date",
                        type: { data: "date", input: "date" },
                        visibility: {
                            dependsOn: "publication_date_mode",
                            operator: "eq",
                            value: "exact"
                        }
                    },
                    {
                        name: "publication_date_range",
                        label: "Publication Date",
                        type: { data: "date", input: "date" },
                        visibility: {
                            dependsOn: "publication_date_mode",
                            operator: "eq",
                            value: "approximate"
                        }
                    },
                    {
                        name: "source_archives",
                        label: "Archived Instance",
                        type: { data: "array", input: "repeating-group" },
                        description: "Capture multiple archived locations and their platform hosts.",
                        fields: [
                            {
                                name: "source_archive_platform",
                                label: "Archive Host / Platform",
                                type: { data: "select", input: "search-select-input" },
                                specification: "source_archive_platform",
                                options: [
                                    'Wayback Machine',
                                    'Archive.today',
                                    'Perma.cc',
                                    'Newspaper Archive',
                                    'SA Media (Sabinet)',
                                    'Newsbank',
                                    'RDM',
                                    'NexusUni'
                                ]
                            },
                            {
                                name: "source_archive_url_accession",
                                label: "Archive URL / Accession Code",
                                type: { data: "string", input: "text" },
                                required: true
                            }
                        ]
                    },
                    {
                        name: "byline_status",
                        label: "Byline Status",
                        type: { data: "string", input: "select" },
                        options: [
                            "Known",
                            "Unknown",
                            "None"
                        ],
                        default: "Known"
                    },
                    {
                        name: "byline",
                        label: "Byline",
                        type: { data: "select", input: "search-select-input" },
                        specification: "byline",
                        options: [],
                        visibility: {
                            dependsOn: "byline_status",
                            operator: "eq",
                            value: "Known"
                        }
                    },
                    {
                        name: "wire_service",
                        label: "Wire Service",
                        type: { data: "select", input: "search-select-input" },
                        specification: "wire_service",
                        options: [

                        ]
                    },
                    {
                        name: "language",
                        label: "Language",
                        type: { data: "select", input: "search-select-input" },
                        options: [
                            'English',
                            'Afrikaans',
                            'Zulu',
                            'Xhosa',
                            'Sotho',
                            'Tswana',
                            'Pedi',
                            'Venda',
                            'Tsonga',
                            'Ndebele',
                            'Swati',
                            'Other',
                        ],
                        specification: "language"
                    },
                    {
                        name: "report_platform",
                        label: "Report Platform",
                        type: { data: "select", input: "search-select-input" },
                        options: [
                            '100punt6',
                            'AFRIKANER',
                            'ALBERTON RECORD',
                            'ALGOA FM',
                            'ALLAFRICA',
                            'BARBERTON TIMES',
                            'BEDFORDVIEW EDENVALE NEWS',
                            'BEELD',
                            'BEELD NAWEEK',
                            'BENONI CITY TIMES',
                            'BIZCOMMUNITY',
                            'BLOEMFONTEIN COURANT',
                            'BOKSBURG ADVERTISER',
                            'BOLAND GAZETTE / KLEINMOND GAZETTE',
                            'BOSVELD REVIEW',
                            'BURGER (DIE BURGER)',
                            'BUSINESS DAY',
                            'CAPE ARGUS',
                            'CAPE TIMES',
                            'CARLETONVILLE HERALD',
                            'CAXTON NEWS SERVICE',
                            'CHANNEL24',
                            'CHATSWORTH RISING SUN',
                            'CITIZEN',
                            'CITIZEN SATURDAY',
                            'CITY PRESS',
                            'COSMOPOLITAN',
                            'CX PRESS',
                            'DAILY DISPATCH (also: Dispatch)',
                            'DAILY MAVERICK',
                            'DAILY NEWS',
                            'DAILY SUN',
                            'DAILY VOICE',
                            'DAILY VOX',
                            'DESTINY',
                            'DESTINY CONNECT',
                            'DIAMOND FIELDS ADVERTISER',
                            'DIE HOORN',
                            'DIE POS',
                            'DIE SON',
                            'DRUM',
                            'EASTERN CAPE TODAY',
                            'EAST COAST RADIO',
                            'EDGE COMMUNITY NEWS',
                            'ENCA',
                            'EP HERALD',
                            'EWN',
                            'EXPRESS',
                            'FAR NORTH BULLETIN',
                            'FARMER\'S WEEKLY',
                            'FINWEEK',
                            'FREE STATE TIMES',
                            'GEORGE HERALD',
                            'GROCOTTS',
                            'GROUNDUP',
                            'HEARTFM',
                            'HERALD',
                            'HOEVELDER/HIGHVELDER',
                            'HUISGENOOT',
                            'IAFRICA',
                            'IKAMVA',
                            'INDEPENDENT ON SATURDAY',
                            'IOL',
                            'ISIZULU24',
                            'ISOLEZWE',
                            'IZINDABA24',
                            'JACARANDA FM',
                            'JBAY NEWS',
                            'KATHU GAZETTE',
                            'KEMPTON EXPRESS',
                            'KERKBODE',
                            'KFM',
                            'KNYSNA PLETT HERALD',
                            'KOUGA EXPRESS',
                            'KROON NUUS',
                            'KRUGERSDORP NEWS',
                            'LADYSMITH GAZETTE',
                            'LAEVELD BULLETIN',
                            'LANDBOUWEEKBLAD',
                            'LEADERSHIP',
                            'LENASIA NEWS',
                            'LIMPOPO MIRROR',
                            'LOOK LOCAL',
                            'LOWVELDER',
                            'MAIL & GUARDIAN',
                            'MAHALA',
                            'MAMBA GIRL',
                            'MAMBA ONLINE',
                            'MARIE CLAIRE ONLINE',
                            'MERCURY (Natal Mercury)',
                            'METRO NEWSPAPER',
                            'MIDDELBURG OBSERVER',
                            'MOPANI HERALD',
                            'MOSSEL BAY ADVERTISER',
                            'MPUMALANGA NEWS',
                            'MTHATHA EXPRESS',
                            'MWEB',
                            'NATAL WITNESS (Witness)',
                            'NETWERK24',
                            'NEWS24',
                            'NORTHERN NEWS',
                            'OFM',
                            'OPPIDAN PRESS',
                            'OUDTSHOORN COURANT',
                            'OVERSTRAND HERALD',
                            'PARYS GAZETTE',
                            'PE EXPRESS',
                            'PE EXPRESS INDABA',
                            'PEOPLE MAGAZINE',
                            'PEOPLE\'S POST',
                            'PEOPLE\'S POST ATHLONE',
                            'PEOPLE\'S POST WOODSTOCK',
                            'PERDEBY',
                            'PLATINUM WEEKLY',
                            'POLOKWANE OBSERVER',
                            'POST',
                            'POTCHEFSTROOM HERALD',
                            'PRETORIA NEWS',
                            'PRETORIA NEWS WEEKEND',
                            'R NEWS',
                            'RANDFONTEIN HERALD',
                            'RAPPORT',
                            'REKORD MOOT',
                            'REKORD PRETORIA NORTH',
                            'RIDGE TIMES',
                            'RISING SUN CHATSWORTH',
                            'ROSEBANK KILLARNEY GAZETTE',
                            'SABC',
                            'SANDTON CHRONICLE',
                            'SARIE',
                            'SATURDAY ARGUS',
                            'SATURDAY INDEPENDENT',
                            'SATURDAY STAR',
                            'SATURDAY VOLKSBLAD',
                            'SEDIBENG STAR/STER',
                            'SERVAMUS',
                            'SOMERSET BUDGET',
                            'SOUTH COAST HERALD',
                            'SOUTHERN COURIER',
                            'SOUTHLAND SUN',
                            'SOWETAN',
                            'SPRINGS ADVERTISER',
                            'STAR (THE STAR)',
                            'STEELBURGER',
                            'SUNDAY ARGUS',
                            'SUNDAY INDEPENDENT',
                            'SUNDAY TIMES',
                            'SUNDAY TRIBUNE',
                            'SUNDAY WORLD',
                            'THE BEAT',
                            'THE NEW AGE (TNA)',
                            'TIMES (THE TIMES)',
                            'TLOKWE NEWS',
                            'TNA FREE STATE',
                            'TRIBUNE',
                            'TYGERBURGER',
                            'VAALWEEKBLAD',
                            'VISTA NEWS',
                            'VOCFM',
                            'VOLKSBLAD',
                            'VROUEKEUR',
                            'VRYSTAAT',
                            'VUTHA NEWS',
                            'WOMEN24',
                            'WEEKEND ARGUS',
                            'WEEKEND POST',
                            'WESLANDER',
                            'WEST CAPE NEWS (WCN)',
                            'WINTERVELDT NEWS',
                            'WITBANK NEWS',
                            'WITNESS',
                            'WITS VUVUZELA',
                            'WORCESTER STANDARD',
                            'YOU',
                            'ZOUTNET',
                            'ZOUTPANSBURGER',
                            'ZULULAND OBSERVER',
                        ],
                        specification: "report_platform"
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ],
            },
            {
                id: "incident",
                name: "Incident",
                description: "Add notes to annotate reports of homicides.",
                icon: "map-pin",
                parentSchemaId: "article",
                titleField: "id",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "evt-{date}-{rand:6}" }, description: "Auto-generated event identifier." },
                    { name: "date", label: "Incident Date", type: { data: "date", input: "date" } },
                    {
                        name: "location_of_homicide",
                        label: "Location",
                        type: { data: "hierarchical-select", input: "select" },
                        options: {
                            $schema: {
                                $label: { "Province": "Town" },
                                $name: { "province": "town" }
                            } as TieredOptionsSchema,
                            "Eastern Cape": [
                                "Port Elizabeth",
                                "East London",
                                "Uitenhage",
                                "Queenstown",
                                "King William's Town",
                                "Mdantsane",
                                "Bisho",
                                "Grahamstown",
                                "Fort Beaufort",
                                "Alice",
                                "Cradock",
                                "Graaff-Reinet",
                                "Port Alfred",
                                "Somerset East",
                                "Stutterheim",
                                "Other",
                                "Unknown"
                            ],
                            "Free State": [
                                "Bloemfontein",
                                "Welkom",
                                "Kroonstad",
                                "Bethlehem",
                                "Sasolburg",
                                "Phuthaditjhaba",
                                "Virginia",
                                "Odendaalsrus",
                                "Parys",
                                "Harrismith",
                                "Ficksburg",
                                "Heilbron",
                                "Hoopstad",
                                "Ladybrand",
                                "Other",
                                "Unknown"
                            ],
                            "Gauteng": [
                                "Johannesburg",
                                "Pretoria",
                                "Soweto",
                                "Benoni",
                                "Tembisa",
                                "Germiston",
                                "Boksburg",
                                "Krugersdorp",
                                "Roodepoort",
                                "Randburg",
                                "Sandton",
                                "Alexandra",
                                "Midrand",
                                "Centurion",
                                "Vanderbijlpark",
                                "Vereeniging",
                                "Springs",
                                "Alberton",
                                "Kempton Park",
                                "Other",
                                "Unknown"
                            ],
                            "KwaZulu-Natal": [
                                "Durban",
                                "Pietermaritzburg",
                                "Pinetown",
                                "Chatsworth",
                                "Umlazi",
                                "Port Shepstone",
                                "Newcastle",
                                "Dundee",
                                "Ladysmith",
                                "Richards Bay",
                                "Empangeni",
                                "Vryheid",
                                "Estcourt",
                                "Maritzburg",
                                "Kokstad",
                                "Other",
                                "Unknown"
                            ],
                            "Limpopo": [
                                "Polokwane",
                                "Thohoyandou",
                                "Lebowakgomo",
                                "Musina",
                                "Giyani",
                                "Tzaneen",
                                "Phalaborwa",
                                "Mokopane",
                                "Bochum",
                                "Louis Trichardt",
                                "Other",
                                "Unknown"
                            ],
                            "Mpumalanga": [
                                "Nelspruit",
                                "Witbank",
                                "Middelburg",
                                "Secunda",
                                "Ermelo",
                                "Bethal",
                                "Standerton",
                                "Barberton",
                                "White River",
                                "Hazyview",
                                "Sabie",
                                "Other",
                                "Unknown"
                            ],
                            "Northern Cape": [
                                "Kimberley",
                                "Upington",
                                "Springbok",
                                "De Aar",
                                "Kuruman",
                                "Port Nolloth",
                                "Calvinia",
                                "Prieska",
                                "Carnarvon",
                                "Other",
                                "Unknown"
                            ],
                            "North West": [
                                "Rustenburg",
                                "Klerksdorp",
                                "Potchefstroom",
                                "Mafikeng",
                                "Brits",
                                "Orkney",
                                "Stilfontein",
                                "Hartbeespoort",
                                "Zeerust",
                                "Other",
                                "Unknown"
                            ],
                            "Western Cape": [
                                "Cape Town",
                                "Bellville",
                                "Mitchell's Plain",
                                "Khayelitsha",
                                "Athlone",
                                "Paarl",
                                "Stellenbosch",
                                "Worcester",
                                "George",
                                "Oudtshoorn",
                                "Mossel Bay",
                                "Hermanus",
                                "Knysna",
                                "Plettenberg Bay",
                                "Swellendam",
                                "Other",
                                "Unknown"
                            ]
                        }
                    },
                    {
                        name: "location_of_homicide_specify",
                        label: "Specify",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "location_of_homicide.province.town",
                            operator: "eq",
                            value: "Other"
                        }
                    },
                    {
                        name: "sexual_assault",
                        label: "Sexual Assault",
                        type: { data: "select", input: "select" },
                        options: [
                            "No",
                            "Yes",
                            "Unknown"
                        ]
                    },
                    {
                        name: "mode_of_death_general",
                        label: "Mode of Death (General)",
                        type: { data: "string", input: "select" },
                        options: [
                            "Sharp force trauma",
                            "Blunt force trauma",
                            "Sharp-blunt/Blunt-sharp force trauma",
                            "Strangulation or asphyxiation",
                            "Poison or burning",
                            "Firearm injury"
                        ]
                    },
                    {
                        name: "mode_of_death_specific",
                        label: "Mode of Death (Specific)",
                        type: { data: "string", input: "select" },
                        options: [
                            "Gunshot",
                            "Strangulation (manual or ligature)",
                            "Suffocation",
                            "Stabbing (knife or similar)",
                            "Chopping (axe or panga or similar)",
                            "Beating",
                            "Poison",
                            "Fire",
                            "Chemical burns",
                            "Electrical shock",
                            "Dogs or other animals",
                            "Lightning",
                            "Drowning ",
                            "Motor vehicle impact",
                            "Falling from height",
                            "Suicide",
                            "Explosive device/explosion",
                            "Missing presumed dead",
                            "Unknown",
                            "Other"
                        ]
                    },
                    {
                        name: "type_of_murder",
                        label: "Type of Murder",
                        type: { data: "array", input: "multi-select" },
                        options: [
                            "Adult male homicide",
                            "Adult female homicide",
                            "Eldercide",
                            "Child murder",
                            "Multiple killing",
                            "Political killing",
                            "Gang-related killing",
                            "Family killing",
                            "Witch killing",
                            "LGBTQ killing",
                            "Sex worker killing",
                            "Farm killing",
                            "Serial killing",
                            "Spree killing",
                            "Intimate partner killing",
                            "Rural killing",
                            "Ritual killing",
                            "Assassination",
                            "Culpable homicide",
                            "Matricide",
                            "Patricide",
                            "Natural causes",
                            "Self-inflicted (including suicide)",
                            "Killing in police custody",
                            "Missing presumed dead",
                            "Hired killers",
                            "Concealment of birth",
                            "Terrorism or war",
                            "Other"
                        ]
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ],
            },

            {
                id: "victim",
                name: "Victim",
                description: "A person that was reported as murdered.",
                icon: "users",
                parentSchemaId: "incident",
                titleField: "name",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "vic-{date}-{rand:6}" }, description: "Auto-generated actor identifier." },
                    { name: "name", label: "Name", type: { data: "string", input: "text" } },
                    { name: "aliases", label: "Alias(es)", type: { data: "array", input: "text-multi" } },
                    {
                        name: "gender",
                        label: "Gender",
                        type: { data: "select", input: "select" },
                        options: [
                            "Female",
                            "Male",
                            "Non-binary",
                            "Unknown"
                        ]
                    },
                    {
                        name: "race",
                        label: "Race",
                        type: { data: "select", input: "select" },
                        options: [
                            'Black',
                            'Coloured',
                            'White',
                            'Indian',
                            'Asian',
                            'Unknown',
                            'Other'
                        ]
                    },
                    {
                        name: "is_age_known",
                        label: "Was the age reported?",
                        type: { data: "boolean", input: "switch" },
                        default: true
                    },
                    {
                        name: "age",
                        label: "Age",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "is_age_known",
                            operator: "eq",
                            value: true
                        }
                    },
                    {
                        name: "age_descriptor",
                        label: "Age Descriptor",
                        type: { data: "select", input: "select" },
                        options: [
                            'Neonate or abandonment',
                            'Baby or infant',
                            'Child',
                            'Teenager',
                            'Young Adult',
                            'Adult',
                            'Elderly',
                            'Unknown'
                        ],
                        default: "Unknown",
                        visibility: {
                            dependsOn: "is_age_known",
                            operator: "eq",
                            value: false
                        }
                    },
                    { name: "nationality", label: "Nationality", type: { data: "string", input: "text" } },
                    {
                        name: "date_of_death_mode",
                        label: "Date of Death Known?",
                        type: { data: "select", input: "select" },
                        options: ["exact", "approximate", "unknown"],
                        default: "exact"
                    },
                    {
                        name: "date_of_death",
                        label: "Date of Death",
                        type: { data: "date", input: "date" },
                        visibility: {
                            dependsOn: "date_of_death_mode",
                            operator: "eq",
                            value: "exact"
                        }
                    },
                    {
                        name: "date_of_death_range",
                        label: "Approximate Date of Death",
                        type: { data: "date-range", input: "date-range" },
                        visibility: {
                            dependsOn: "date_of_death_mode",
                            operator: "eq",
                            value: "approximate"
                        }
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ]
            },
            {
                id: "perpetrator",
                name: "Perpetrator",
                description: "A person who was reported as committing a murder.",
                icon: "users",
                parentSchemaId: "incident",
                titleField: "name",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "perp-{date}-{rand:6}" }, description: "Auto-generated actor identifier." },
                    { name: "name", label: "Name", type: { data: "string", input: "text" } },
                    { name: "aliases", label: "Alias(es)", type: { data: "array", input: "text-multi" } },
                    {
                        name: "gender",
                        label: "Gender",
                        type: { data: "select", input: "select" },
                        options: [
                            "Female",
                            "Male",
                            "Non-binary",
                            "Unknown"
                        ]
                    },
                    {
                        name: "race",
                        label: "Race",
                        type: { data: "select", input: "select" },
                        options: [
                            'Black',
                            'Coloured',
                            'White',
                            'Indian',
                            'Asian',
                            'Unknown',
                            'Other'
                        ]
                    },
                    {
                        name: "is_age_known",
                        label: "Was the age reported?",
                        type: { data: "boolean", input: "switch" },
                        default: true
                    },
                    {
                        name: "age",
                        label: "Age",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "is_age_known",
                            operator: "eq",
                            value: true
                        }
                    },
                    {
                        name: "age_descriptor",
                        label: "Age Descriptor",
                        type: { data: "select", input: "select" },
                        options: [
                            'Neonate or abandonment',
                            'Baby or infant',
                            'Child',
                            'Teenager',
                            'Young Adult',
                            'Adult',
                            'Elderly',
                            'Unknown'
                        ],
                        default: "Unknown",
                        visibility: {
                            dependsOn: "is_age_known",
                            operator: "eq",
                            value: false
                        }
                    },
                    { name: "nationality", label: "Nationality", type: { data: "string", input: "text" } },
                    {
                        name: "relationship_to_victim",
                        label: "Relationship to Victim",
                        type: { data: "array", input: "multi-select" },
                        options: [
                            "Stranger",
                            "Current or former intimate partner",
                            "Love rival",
                            "Current or former employee",
                            "Current or former employer",
                            "Terrorist (state label)",
                            "Parent",
                            "Child",
                            "Grandchild",
                            "Grandparent",
                            "Mother-in-law",
                            "Sister-in-law",
                            "Brother-in-law",
                            "Son-in-law",
                            "Daughter-in-law",
                            "Father-in-law",
                            "Aunt",
                            "Uncle",
                            "Niece",
                            "Nephew",
                            "Cousin",
                            "Close family member (unknown relationship or more distant than first cousin)",
                            "Stepchild",
                            "Step-parent",
                            "Foster child",
                            "Foster parent",
                            "Police officer",
                            "Suspect in police or security custody",
                            "Security Guard",
                            "Community member",
                            "Other"
                        ],
                        "noSelectionValue": "Unknown"
                    },
                    {
                        name: "relationship_to_victim_specify",
                        label: "Specify",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "relationship_to_victim",
                            operator: "includes",
                            value: "Other"
                        }
                    },
                    {
                        name: "identified",
                        label: "Identified?",
                        type: { data: "select", input: "select" },
                        options: ["No", "Yes", "Unknown"],
                        default: "Unknown"
                    },
                    {
                        name: "arrested",
                        label: "Arrested?",
                        type: { data: "select", input: "select" },
                        options: ["No", "Yes", "Unknown"],
                        default: "Unknown",
                        visibility: {
                            dependsOn: "identified",
                            operator: "eq",
                            value: "Yes"
                        }
                    },
                    {
                        name: "charged",
                        label: "Charged?",
                        type: { data: "select", input: "select" },
                        options: ["No", "Yes", "Unknown"],
                        default: "Unknown",
                        visibility: {
                            dependsOn: "arrested",
                            operator: "eq",
                            value: "Yes"
                        }
                    },
                    { name: "charges", label: "Charges", type: { data: "string", input: "text" } },
                    {
                        name: "convicted",
                        label: "Convicted?",
                        type: { data: "select", input: "select" },
                        options: ["No", "Yes", "Unknown"],
                        default: "Unknown",
                        visibility: {
                            dependsOn: "charged",
                            operator: "eq",
                            value: "Yes"
                        }
                    },
                    { name: "sentence", label: "Sentence", type: { data: "string", input: "text" } },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ]
            }
        ]
    }
]

export {
    buildFieldDefinitionsForParent,
    createSchemaFromTemplate,
    createSchemaGroupFromTemplate,
    createSchemaFromSheet,

    DEFAULT_SCHEMA_TEMPLATES
}