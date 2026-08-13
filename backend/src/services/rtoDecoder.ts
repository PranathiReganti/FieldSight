/**
 * Indian Ministry of Road Transport and Highways (MoRTH) RTO Location Dictionary.
 * Maps Indian State & District codes to official RTO Offices and District names.
 */

export interface RTODetails {
  stateCode: string;
  districtCode: string;
  stateName: string;
  rtoOffice: string;
  districtName: string;
  vehicleCategory: string;
}

const STATE_NAMES: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  CH: "Chandigarh",
  DD: "Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

// Major RTO office locations across key Indian states
const RTO_OFFICES: Record<string, Record<string, { office: string; district: string }>> = {
  MH: {
    "01": { office: "Mumbai Central (Tardeo) RTO", district: "Mumbai City" },
    "02": { office: "Mumbai West (Andheri) RTO", district: "Mumbai Suburban" },
    "03": { office: "Mumbai East (Wadala) RTO", district: "Mumbai Suburban" },
    "04": { office: "Thane RTO", district: "Thane" },
    "05": { office: "Kalyan RTO", district: "Thane" },
    "06": { office: "Raigad RTO", district: "Raigad" },
    "09": { office: "Kolhapur RTO", district: "Kolhapur" },
    "10": { office: "Sangli RTO", district: "Sangli" },
    "11": { office: "Satara RTO", district: "Satara" },
    "12": { office: "Pune RTO", district: "Pune" },
    "13": { office: "Solapur RTO", district: "Solapur" },
    "14": { office: "Pimpri-Chinchwad RTO", district: "Pune" },
    "15": { office: "Nashik RTO", district: "Nashik" },
    "19": { office: "Jalgaon RTO", district: "Jalgaon" },
    "20": { office: "Aurangabad RTO", district: "Chhatrapati Sambhajinagar" },
    "27": { office: "Amravati RTO", district: "Amravati" },
    "31": { office: "Nagpur Urban RTO", district: "Nagpur" },
    "43": { office: "Navi Mumbai (Vashi) RTO", district: "Thane" },
    "46": { office: "Navi Mumbai (Panvel) RTO", district: "Raigad" },
    "47": { office: "Mumbai North (Borivali) RTO", district: "Mumbai Suburban" },
  },
  KA: {
    "01": { office: "Bangalore Central (Koramangala) RTO", district: "Bangalore Urban" },
    "02": { office: "Bangalore West (Rajajinagar) RTO", district: "Bangalore Urban" },
    "03": { office: "Bangalore East (Indiranagar) RTO", district: "Bangalore Urban" },
    "04": { office: "Bangalore North (Yeshwanthpur) RTO", district: "Bangalore Urban" },
    "05": { office: "Bangalore South (Jayanagar) RTO", district: "Bangalore Urban" },
    "06": { office: "Tumkur RTO", district: "Tumkur" },
    "07": { office: "Kolar RTO", district: "Kolar" },
    "08": { office: "KGF RTO", district: "Kolar" },
    "09": { office: "Mysore West RTO", district: "Mysore" },
    "10": { office: "Chamrajnagar RTO", district: "Chamrajnagar" },
    "11": { office: "Mandya RTO", district: "Mandya" },
    "12": { office: "Madikeri RTO", district: "Kodagu" },
    "13": { office: "Hassan RTO", district: "Hassan" },
    "14": { office: "Shimoga RTO", district: "Shimoga" },
    "15": { office: "Sagar RTO", district: "Shimoga" },
    "16": { office: "Chitradurga RTO", district: "Chitradurga" },
    "17": { office: "Davangere RTO", district: "Davangere" },
    "18": { office: "Chikmagalur RTO", district: "Chikmagalur" },
    "19": { office: "Mangalore RTO", district: "Dakshina Kannada" },
    "20": { office: "Udupi RTO", district: "Udupi" },
    "22": { office: "Belgaum RTO", district: "Belgaum" },
    "25": { office: "Dharwad / Hubli RTO", district: "Dharwad" },
    "50": { office: "Yelahanka RTO", district: "Bangalore Urban" },
    "51": { office: "Electronic City RTO", district: "Bangalore Urban" },
    "53": { office: "K.R. Puram RTO", district: "Bangalore Urban" },
  },
  TN: {
    "01": { office: "Chennai Central (Ayanavaram) RTO", district: "Chennai" },
    "02": { office: "Chennai North-West (Anna Nagar) RTO", district: "Chennai" },
    "03": { office: "Chennai North-East (Tondiarpet) RTO", district: "Chennai" },
    "04": { office: "Chennai East (Royapuram) RTO", district: "Chennai" },
    "05": { office: "Chennai North (Kolathur) RTO", district: "Chennai" },
    "06": { office: "Chennai South-East (Mandavelli) RTO", district: "Chennai" },
    "07": { office: "Chennai South (Thiruvanmiyur) RTO", district: "Chennai" },
    "09": { office: "Chennai West (K.K. Nagar) RTO", district: "Chennai" },
    "10": { office: "Chennai South-West (Virugambakkam) RTO", district: "Chennai" },
    "11": { office: "Tambaram RTO", district: "Chengalpattu" },
    "20": { office: "Tiruvallur RTO", district: "Tiruvallur" },
    "22": { office: "Meenambakkam RTO", district: "Chennai" },
    "37": { office: "Coimbatore South RTO", district: "Coimbatore" },
    "38": { office: "Coimbatore North RTO", district: "Coimbatore" },
    "58": { office: "Madurai South RTO", district: "Madurai" },
    "59": { office: "Madurai North RTO", district: "Madurai" },
  },
  DL: {
    "1": { office: "Civil Lines / Mall Road RTO", district: "North Delhi" },
    "01": { office: "Civil Lines / Mall Road RTO", district: "North Delhi" },
    "2": { office: "Indraprastha Depot RTO", district: "Central Delhi" },
    "02": { office: "Indraprastha Depot RTO", district: "Central Delhi" },
    "3": { office: "Sheikh Sarai RTO", district: "South Delhi" },
    "03": { office: "Sheikh Sarai RTO", district: "South Delhi" },
    "4": { office: "Janakpuri RTO", district: "West Delhi" },
    "04": { office: "Janakpuri RTO", district: "West Delhi" },
    "5": { office: "Loni Road RTO", district: "North-East Delhi" },
    "05": { office: "Loni Road RTO", district: "North-East Delhi" },
    "6": { office: "Sarai Kale Khan RTO", district: "Central Delhi" },
    "06": { office: "Sarai Kale Khan RTO", district: "Central Delhi" },
    "7": { office: "Mayur Vihar RTO", district: "East Delhi" },
    "07": { office: "Mayur Vihar RTO", district: "East Delhi" },
    "8": { office: "Wazirpur RTO", district: "North-West Delhi" },
    "08": { office: "Wazirpur RTO", district: "North-West Delhi" },
    "9": { office: "Palam / Dwarka RTO", district: "South-West Delhi" },
    "09": { office: "Palam / Dwarka RTO", district: "South-West Delhi" },
    "10": { office: "Raja Garden RTO", district: "West Delhi" },
    "11": { office: "Rohini RTO", district: "North-West Delhi" },
    "12": { office: "Vasant Vihar RTO", district: "South-West Delhi" },
  },
  GJ: {
    "01": { office: "Ahmedabad City (Subhash Bridge) RTO", district: "Ahmedabad" },
    "02": { office: "Mehsana RTO", district: "Mehsana" },
    "03": { office: "Rajkot RTO", district: "Rajkot" },
    "04": { office: "Bhavnagar RTO", district: "Bhavnagar" },
    "05": { office: "Surat City RTO", district: "Surat" },
    "06": { office: "Vadodara City RTO", district: "Vadodara" },
    "18": { office: "Gandhinagar RTO", district: "Gandhinagar" },
    "27": { office: "Ahmedabad East (Vastral) RTO", district: "Ahmedabad" },
  },
  TS: {
    "07": { office: "Hyderabad Central (Khairatabad) RTO", district: "Hyderabad" },
    "08": { office: "Hyderabad East (Malakpet) RTO", district: "Hyderabad" },
    "09": { office: "Hyderabad South (Bahadurpura) RTO", district: "Hyderabad" },
    "10": { office: "Secunderabad RTO", district: "Hyderabad" },
    "11": { office: "Hyderabad West (Mehdipatnam) RTO", district: "Hyderabad" },
    "12": { office: "Hyderabad North (Toli Chowki) RTO", district: "Hyderabad" },
    "03": { office: "Warangal Urban RTO", district: "Hanamkonda" },
  },
  UP: {
    "14": { office: "Ghaziabad RTO", district: "Ghaziabad" },
    "16": { office: "Gautam Buddha Nagar (Noida) RTO", district: "Gautam Buddha Nagar" },
    "32": { office: "Lucknow (Transport Nagar) RTO", district: "Lucknow" },
    "70": { office: "Prayagraj (Allahabad) RTO", district: "Prayagraj" },
    "78": { office: "Kanpur Nagar RTO", district: "Kanpur" },
    "80": { office: "Agra RTO", district: "Agra" },
    "65": { office: "Varanasi RTO", district: "Varanasi" },
  }
};

/**
 * Decodes an Indian vehicle registration number into official RTO and state details.
 */
export function decodeRTO(vehicleNumber: string | null | undefined): RTODetails | null {
  if (!vehicleNumber) {
    return null;
  }

  const clean = vehicleNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Match state (2 letters), district (1-2 digits), series (1-3 letters), number (4 digits)
  const match = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/);

  if (!match) {
    return null;
  }

  const stateCode = match[1];
  const districtCode = match[2];
  const series = match[3];

  const stateName = STATE_NAMES[stateCode] || stateCode;
  const stateRtos = RTO_OFFICES[stateCode];
  const paddedDistrict = districtCode.length === 1 ? districtCode.padStart(2, "0") : districtCode;

  const rtoInfo = stateRtos?.[districtCode] || stateRtos?.[paddedDistrict];
  const rtoOffice = rtoInfo ? rtoInfo.office : `${stateName} RTO (District ${districtCode})`;
  const districtName = rtoInfo ? rtoInfo.district : `District ${districtCode}`;

  // Vehicle category heuristic (e.g. N/NW/T/TA series on commercial, standard private)
  const isCommercialSeries =
    series.startsWith("T") ||
    series.startsWith("V") ||
    series.startsWith("Y") ||
    series.includes("NW") ||
    series.includes("BT");

  const vehicleCategory = isCommercialSeries
    ? "Commercial / Transport Vehicle"
    : "Private / Non-Transport Vehicle";

  return {
    stateCode,
    districtCode,
    stateName,
    rtoOffice,
    districtName,
    vehicleCategory,
  };
}
