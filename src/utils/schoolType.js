export const HS_GRADES  = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
export const MS_GRADES  = ['6th Grade', '7th Grade', '8th Grade'];
export const HS_LEVELS  = ['Varsity', 'JV', 'Freshman'];
export const MS_LEVELS  = ['Varsity', 'JV', '6th/7th', '7th/8th', '8th Grade'];

export function gradesFor(schoolType) {
  return schoolType === 'middle_school' ? MS_GRADES : HS_GRADES;
}

export function levelsFor(schoolType) {
  return schoolType === 'middle_school' ? MS_LEVELS : HS_LEVELS;
}
