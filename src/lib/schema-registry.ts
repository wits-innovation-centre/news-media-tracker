import type { DocumentSchema, DocumentSchemaGroup, FieldDefinition, TieredOptionsSchema } from "@/lib/types"

const DEFAULT_SCHEMA_TEMPLATES: DocumentSchemaGroup[] = [
    {
        id: "homicide-tracking",
        name: "Homicide Tracking",
        description: "Annotate reports of homicide.",
        documents: [
            {
                id: "event",
                name: "event",
                description: "Add notes to annotate reports of homicides.",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "evt-{date}-{rand:6}" }, description: "Auto-generated event identifier." },
                    { name: "name", label: "Event Title", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "Event {date} {rand:4}" }, description: "Generated working title; you can rename this after details are known." },
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
                    { name: "report", label: "Report", type: { data: "array<string>", input: "select" } },
                    {
                        name: "type_of_murder",
                        label: "Type of Murder",
                        type: { data: "select", input: "select" },
                        options: [
                            '',
                            'Domestic Violence',
                            'Gang Related',
                            'Robbery Related',
                            'Sexual Violence',
                            'Child Murder',
                            'Hate Crime',
                            'Drug Related',
                            'Unknown/Other',
                        ]
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ],
            },
            {
                id: "report",
                name: "report",
                description: "Capture a report of homicide.",
                parentSchemaId: "event",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "rpt-{date}-{rand:6}" }, description: "Auto-generated report identifier." },
                    { name: "headline", label: "Headline", type: { data: "string", input: "text" }, required: true },
                    { name: "url", label: "URL", type: { data: "string", input: "text" }, required: true },
                    { name: "date", label: "Publication Date", type: { data: "date", input: "date" } },
                    {
                        name: "author_identity_status",
                        label: "Author Identity Status",
                        type: { data: "string", input: "select" },
                        options: [
                            "Known",
                            "Undisclosed",
                            "Anonymous",
                            "Unknown"
                        ],
                        default: "Known"
                    },
                    {
                        name: "author",
                        label: "Author(s)",
                        type: { data: "array<string>", input: "search-select-input" },
                        specification: "author",
                        visibility: {
                            dependsOn: "author_identity_status",
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
                        type: { data: "select", input: "select" },
                        options: [
                            '',
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
                        ]
                    },
                    {
                        name: "type_of_source",
                        label: "Source Type",
                        type: { data: "select", input: "search-select-input" },
                        specification: "report_platform",
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
                        name: "report_platform",
                        label: "Report Platform",
                        type: { data: "select", input: "select" },
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
                        ]
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ],
            },
            {
                id: "actor",
                name: "actor",
                description: "The people that participated in the reported event.",
                parentSchemaId: "event",
                fields: [
                    { name: "id", label: "ID", type: { data: "string", input: "text" }, required: true, generator: { strategy: "pattern", pattern: "act-{date}-{rand:6}" }, description: "Auto-generated actor identifier." },
                    { name: "name", label: "Name", type: { data: "string", input: "text" } },
                    { name: "aliases", label: "Alias(es)", type: { data: "array<string>", input: "text-multi" } },
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
                        label: "Age",
                        type: { data: "select", input: "switch" },
                        options: [
                            "Known",
                            "Unknown"
                        ],
                        default: "Known"
                    },
                    {
                        name: "age",
                        label: "Age",
                        type: { data: "string", input: "text" },
                        visibility: {
                            dependsOn: "is_age_known",
                            operator: "eq",
                            value: "Known"
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
                            value: "Unknown"
                        }
                    },
                    { name: "nationality", label: "Nationality", type: { data: "string", input: "text" } },
                    { name: "mode_of_death_specific", label: "Mode of Death (Specific)", type: { data: "string", input: "text" } },
                    { name: "mode_of_death_general", label: "Mode of Death (General)", type: { data: "string", input: "text" } },
                    {
                        name: "type_of_murder",
                        label: "Type of Murder",
                        type: { data: "select", input: "select" },
                        options: [
                            'Domestic Violence',
                            'Gang Related',
                            'Robbery Related',
                            'Sexual Violence',
                            'Child Murder',
                            'Hate Crime',
                            'Drug Related',
                            'Unknown/Other'
                        ]
                    },
                    { name: "notes", label: "Notes", type: { data: "markdown", input: "textarea" } },
                ],
                subtypeFields: {
                    "victim": [
                        {
                            name: "date_of_death_mode",
                            label: "Date of Death",
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

                    ],
                    "perpetrator": [
                        {
                            name: "relationship_to_victim",
                            label: "Relationship to Victim",
                            type: { data: "select", input: "select" },
                            options: [
                                'Spouse/Partner',
                                'Ex-Spouse/Ex-Partner',
                                'Family Member',
                                'Friend',
                                'Acquaintance',
                                'Stranger',
                                'Unknown',
                                'Other'
                            ]
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
                    ]
                }
            }
        ]
    }
]

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

            const clonedFields = doc.fields.map((field) => ({
                ...field,
                type: { ...field.type },
                options: Array.isArray(field.options)
                    ? [...field.options]
                    : field.options
                        ? JSON.parse(JSON.stringify(field.options))
                        : undefined
            }));

            const clonedSubtypeFields: Record<string, FieldDefinition[]> = {};
            if (doc.subtypeFields) {
                Object.entries(doc.subtypeFields).forEach(([subType, fields]) => {
                    clonedSubtypeFields[subType] = fields.map((field) => ({
                        ...field,
                        type: { ...field.type },
                        options: Array.isArray(field.options)
                            ? [...field.options]
                            : field.options
                                ? JSON.parse(JSON.stringify(field.options))
                                : undefined
                    }));
                });
            }

            return {
                ...doc,
                id: newDocId,
                parentSchemaId: doc.parentSchemaId ? (idMap[doc.parentSchemaId] ?? doc.parentSchemaId) : undefined,
                groupId: template.id,
                groupName: template.name,
                fields: clonedFields,
                subtypeFields: doc.subtypeFields ? clonedSubtypeFields : undefined,
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
        fields: (overrides?.fields ?? template.fields).map((field) => ({
            ...field,
            type: { ...field.type },
            options: Array.isArray(field.options)
                ? [...field.options]
                : field.options
                    ? JSON.parse(JSON.stringify(field.options))
                    : undefined
        })),
        subtypeFields: template.subtypeFields ? Object.fromEntries(
            Object.entries(template.subtypeFields).map(([k, fields]) => [
                k,
                fields.map((field) => ({
                    ...field,
                    type: { ...field.type },
                    options: Array.isArray(field.options)
                        ? [...field.options]
                        : field.options
                            ? JSON.parse(JSON.stringify(field.options))
                            : undefined
                }))
            ])
        ) : undefined
    };
};

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

    const clonedDocuments = template.documents.map((doc) => {
        const newDocId = idMap[doc.id];

        const clonedFields = doc.fields.map((field) => ({
            ...field,
            type: { ...field.type },
            options: Array.isArray(field.options)
                ? [...field.options]
                : field.options
                    ? JSON.parse(JSON.stringify(field.options))
                    : undefined
        }));

        const clonedSubtypeFields: Record<string, FieldDefinition[]> = {};
        if (doc.subtypeFields) {
            Object.entries(doc.subtypeFields).forEach(([subType, fields]) => {
                clonedSubtypeFields[subType] = fields.map((field) => ({
                    ...field,
                    type: { ...field.type },
                    options: Array.isArray(field.options)
                        ? [...field.options]
                        : field.options
                            ? JSON.parse(JSON.stringify(field.options))
                            : undefined
                }));
            });
        }

        return {
            ...doc,
            id: newDocId,
            parentSchemaId: doc.parentSchemaId ? (idMap[doc.parentSchemaId] ?? doc.parentSchemaId) : undefined,
            fields: clonedFields,
            subtypeFields: doc.subtypeFields ? clonedSubtypeFields : undefined,
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
};

function buildFieldDefinitionsForParent(parentSchema?: DocumentSchema, childSchema?: DocumentSchema): FieldDefinition[] {
    const inheritedFields = parentSchema?.fields ?? []
    const childFields = childSchema?.fields ?? []
    return [
        ...inheritedFields.map((field) => ({ ...field })),
        ...childFields.map((field) => ({ ...field })),
    ]
}

export {
    DEFAULT_SCHEMA_TEMPLATES,

    buildFieldDefinitionsForParent,
    createSchemaFromTemplate,
    createSchemaGroupFromTemplate
}