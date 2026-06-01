import type { Victim } from '../../../lib/db/schema';
import {
  toNullableNumber,
  toNullableString,
  toRequiredString,
} from '../../../lib/utils/coercion';

type VictimCoreFields =
  | 'articleId'
  | 'victimName'
  | 'victimAlias'
  | 'victimAliases'
  | 'dateOfDeath'
  | 'dateOfDeathMode'
  | 'dateOfDeathEnd'
  | 'placeOfDeathProvince'
  | 'placeOfDeathTown'
  | 'typeOfLocation'
  | 'policeStation'
  | 'sexualAssault'
  | 'genderOfVictim'
  | 'raceOfVictim'
  | 'nationality'
  | 'ageOfVictim'
  | 'ageRangeOfVictim'
  | 'ageDescriptor'
  | 'modeOfDeathSpecific'
  | 'modeOfDeathGeneral'
  | 'typeOfMurder'
  | 'notes';

export type VictimCore = Pick<Victim, VictimCoreFields>;

export const coerceVictim = (
  victimData: Record<string, unknown>,
  current?: Victim,
): VictimCore => ({
  articleId: toRequiredString(victimData.articleId, current?.articleId ?? ''),
  victimName: toNullableString(
    victimData.victimName,
    current?.victimName ?? null,
  ),
  victimAlias: toNullableString(
    victimData.victimAlias,
    current?.victimAlias ?? null,
  ),
  victimAliases: toNullableString(
    victimData.victimAliases,
    current?.victimAliases ?? null,
  ),
  dateOfDeath: toNullableString(
    victimData.dateOfDeath,
    current?.dateOfDeath ?? null,
  ),
  dateOfDeathMode: toNullableString(
    victimData.dateOfDeathMode,
    current?.dateOfDeathMode ?? null,
  ),
  dateOfDeathEnd: toNullableString(
    victimData.dateOfDeathEnd,
    current?.dateOfDeathEnd ?? null,
  ),
  placeOfDeathProvince: toNullableString(
    victimData.placeOfDeathProvince,
    current?.placeOfDeathProvince ?? null,
  ),
  placeOfDeathTown: toNullableString(
    victimData.placeOfDeathTown,
    current?.placeOfDeathTown ?? null,
  ),
  typeOfLocation: toNullableString(
    victimData.typeOfLocation,
    current?.typeOfLocation ?? null,
  ),
  policeStation: toNullableString(
    victimData.policeStation,
    current?.policeStation ?? null,
  ),
  sexualAssault: toNullableString(
    victimData.sexualAssault,
    current?.sexualAssault ?? null,
  ),
  genderOfVictim: toNullableString(
    victimData.genderOfVictim,
    current?.genderOfVictim ?? null,
  ),
  raceOfVictim: toNullableString(
    victimData.raceOfVictim,
    current?.raceOfVictim ?? null,
  ),
  nationality: toNullableString(
    victimData.nationality,
    current?.nationality ?? null,
  ),
  ageOfVictim: toNullableNumber(
    victimData.ageOfVictim,
    current?.ageOfVictim ?? null,
  ),
  ageRangeOfVictim: toNullableString(
    victimData.ageRangeOfVictim,
    current?.ageRangeOfVictim ?? null,
  ),
  ageDescriptor: toNullableString(
    victimData.ageDescriptor,
    current?.ageDescriptor ?? null,
  ),
  modeOfDeathSpecific: toNullableString(
    victimData.modeOfDeathSpecific,
    current?.modeOfDeathSpecific ?? null,
  ),
  modeOfDeathGeneral: toNullableString(
    victimData.modeOfDeathGeneral,
    current?.modeOfDeathGeneral ?? null,
  ),
  typeOfMurder: toNullableString(
    victimData.typeOfMurder,
    current?.typeOfMurder ?? null,
  ),
  notes: toNullableString(victimData.notes, current?.notes ?? null),
});
