import { haversineKm, type LatLng } from "@/lib/geo"

/**
 * The airports people actually fly between on Trippo trips, with the place
 * names that should resolve to them. Coordinates are airport positions, so
 * flight-versus-road decisions and airport transfers don't need a lookup.
 *
 * Not exhaustive on purpose: anything missing falls back to a SerpApi lookup
 * or to the nearest airport in this table.
 */
export type Airport = {
  iata: string
  name: string
  /** The city the airport serves, used for "arrive in ..." copy. */
  city: string
  country: string
  /** Lower-case, letters only: "sri lanka" is stored as "srilanka". */
  keys: string[]
  lat: number
  lng: number
}

const A = (
  iata: string,
  name: string,
  city: string,
  country: string,
  lat: number,
  lng: number,
  ...keys: string[]
): Airport => ({ iata, name, city, country, lat, lng, keys })

export const AIRPORTS: Airport[] = [
  // India
  A("BLR", "Kempegowda International Airport", "Bengaluru", "India", 13.1986, 77.7066, "bengaluru", "bangalore", "blr"),
  A("DEL", "Indira Gandhi International Airport", "Delhi", "India", 28.5562, 77.1, "delhi", "newdelhi", "del"),
  A("BOM", "Chhatrapati Shivaji Maharaj International Airport", "Mumbai", "India", 19.0896, 72.8656, "mumbai", "bombay", "bom"),
  A("MAA", "Chennai International Airport", "Chennai", "India", 12.9941, 80.1709, "chennai", "madras", "maa"),
  A("HYD", "Rajiv Gandhi International Airport", "Hyderabad", "India", 17.2403, 78.4294, "hyderabad", "hyd"),
  A("CCU", "Netaji Subhas Chandra Bose International Airport", "Kolkata", "India", 22.6547, 88.4467, "kolkata", "calcutta", "ccu"),
  A("GOI", "Dabolim Airport", "Goa", "India", 15.3808, 73.8314, "goa", "panaji", "margao", "goi"),
  A("COK", "Cochin International Airport", "Kochi", "India", 10.152, 76.4019, "kochi", "cochin", "ernakulam", "munnar", "alleppey", "alappuzha", "kerala", "cok"),
  A("TRV", "Trivandrum International Airport", "Thiruvananthapuram", "India", 8.4821, 76.9201, "thiruvananthapuram", "trivandrum", "kovalam", "varkala", "trv"),
  A("PNQ", "Pune Airport", "Pune", "India", 18.5822, 73.9197, "pune", "pnq"),
  A("AMD", "Sardar Vallabhbhai Patel International Airport", "Ahmedabad", "India", 23.0772, 72.6347, "ahmedabad", "amd"),
  A("JAI", "Jaipur International Airport", "Jaipur", "India", 26.8242, 75.8122, "jaipur", "jai"),
  A("IXE", "Mangaluru International Airport", "Mangaluru", "India", 12.9613, 74.8901, "mangaluru", "mangalore", "udupi", "gokarna", "ixe"),
  A("MYQ", "Mysuru Airport", "Mysuru", "India", 12.3072, 76.6497, "mysuru", "mysore", "coorg", "kodagu", "madikeri", "myq"),
  A("LKO", "Chaudhary Charan Singh International Airport", "Lucknow", "India", 26.7606, 80.8893, "lucknow", "lko"),
  A("VNS", "Lal Bahadur Shastri Airport", "Varanasi", "India", 25.4524, 82.8593, "varanasi", "banaras", "vns"),
  A("ATQ", "Sri Guru Ram Dass Jee International Airport", "Amritsar", "India", 31.7096, 74.7973, "amritsar", "atq"),
  A("IXL", "Kushok Bakula Rimpochee Airport", "Leh", "India", 34.1359, 77.5465, "leh", "ladakh", "ixl"),
  A("SXR", "Srinagar International Airport", "Srinagar", "India", 33.9871, 74.7742, "srinagar", "kashmir", "sxr"),
  A("GAU", "Lokpriya Gopinath Bordoloi International Airport", "Guwahati", "India", 26.1061, 91.5859, "guwahati", "assam", "gau"),
  A("IXZ", "Veer Savarkar International Airport", "Port Blair", "India", 11.641, 92.7297, "portblair", "andaman", "ixz"),
  A("UDR", "Maharana Pratap Airport", "Udaipur", "India", 24.6177, 73.8961, "udaipur", "udr"),
  A("VTZ", "Visakhapatnam Airport", "Visakhapatnam", "India", 17.7212, 83.2245, "visakhapatnam", "vizag", "vtz"),
  // South & South-East Asia
  A("CMB", "Bandaranaike International Airport", "Colombo", "Sri Lanka", 7.1808, 79.8841, "colombo", "srilanka", "lanka", "negombo", "kandy", "galle", "ella", "cmb"),
  A("MLE", "Velana International Airport", "Malé", "Maldives", 4.1918, 73.529, "male", "maldives", "mle"),
  A("KTM", "Tribhuvan International Airport", "Kathmandu", "Nepal", 27.6966, 85.3591, "kathmandu", "nepal", "pokhara", "ktm"),
  A("PBH", "Paro International Airport", "Paro", "Bhutan", 27.4032, 89.4246, "paro", "bhutan", "thimphu", "pbh"),
  A("SIN", "Singapore Changi Airport", "Singapore", "Singapore", 1.3644, 103.9915, "singapore", "sin"),
  A("BKK", "Suvarnabhumi Airport", "Bangkok", "Thailand", 13.69, 100.7501, "bangkok", "thailand", "pattaya", "bkk"),
  A("HKT", "Phuket International Airport", "Phuket", "Thailand", 8.1132, 98.3169, "phuket", "krabi", "hkt"),
  A("KUL", "Kuala Lumpur International Airport", "Kuala Lumpur", "Malaysia", 2.7456, 101.7099, "kualalumpur", "malaysia", "kul"),
  A("DPS", "Ngurah Rai International Airport", "Denpasar", "Indonesia", -8.7482, 115.1672, "bali", "denpasar", "ubud", "indonesia", "dps"),
  A("SGN", "Tan Son Nhat International Airport", "Ho Chi Minh City", "Vietnam", 10.8188, 106.652, "hochiminh", "saigon", "vietnam", "sgn"),
  A("HAN", "Noi Bai International Airport", "Hanoi", "Vietnam", 21.2212, 105.8072, "hanoi", "han"),
  A("REP", "Siem Reap International Airport", "Siem Reap", "Cambodia", 13.4107, 103.813, "siemreap", "cambodia", "angkor", "rep"),
  // Middle East
  A("DXB", "Dubai International Airport", "Dubai", "UAE", 25.2532, 55.3657, "dubai", "uae", "emirates", "dxb"),
  A("AUH", "Zayed International Airport", "Abu Dhabi", "UAE", 24.433, 54.6511, "abudhabi", "auh"),
  A("DOH", "Hamad International Airport", "Doha", "Qatar", 25.2731, 51.6081, "doha", "qatar", "doh"),
  // Far abroad
  A("NRT", "Narita International Airport", "Tokyo", "Japan", 35.772, 140.3929, "tokyo", "japan", "nrt"),
  A("ICN", "Incheon International Airport", "Seoul", "South Korea", 37.4602, 126.4407, "seoul", "korea", "icn"),
  A("LHR", "Heathrow Airport", "London", "United Kingdom", 51.47, -0.4543, "london", "unitedkingdom", "england", "lhr"),
  A("CDG", "Charles de Gaulle Airport", "Paris", "France", 49.0097, 2.5479, "paris", "france", "cdg"),
  A("IST", "Istanbul Airport", "Istanbul", "Turkey", 41.2753, 28.7519, "istanbul", "turkey", "ist"),
  A("SYD", "Sydney Kingsford Smith Airport", "Sydney", "Australia", -33.9399, 151.1753, "sydney", "australia", "syd"),
  A("JFK", "John F. Kennedy International Airport", "New York", "USA", 40.6413, -73.7781, "newyork", "nyc", "jfk"),
]

/** Every run of 1-3 consecutive words, joined: "Sri Lanka" yields "sri", "lanka", "srilanka". */
function phrases(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    let joined = ""
    for (let len = 0; len < 3 && i + len < words.length; len++) {
      joined += words[i + len]
      out.add(joined)
    }
  }
  return out
}

/** The airport a place name (a city, a country, or an IATA code) should resolve to. */
export function findAirport(text: string | null | undefined): Airport | undefined {
  if (!text) return undefined
  const found = phrases(text)
  if (found.size === 0) return undefined
  // Whole words only, so "male" never matches "female". The longest key wins.
  let best: { airport: Airport; len: number } | undefined
  for (const airport of AIRPORTS) {
    for (const key of airport.keys) {
      if (found.has(key) && (!best || key.length > best.len)) {
        best = { airport, len: key.length }
      }
    }
  }
  return best?.airport
}

export function nearestAirport(point: LatLng): Airport {
  let best = AIRPORTS[0]
  let min = Number.POSITIVE_INFINITY
  for (const airport of AIRPORTS) {
    const d = haversineKm(point, airport)
    if (d < min) {
      min = d
      best = airport
    }
  }
  return best
}

const COUNTRY_KEYS = new Set([
  "srilanka", "lanka", "maldives", "nepal", "bhutan", "thailand", "malaysia", "indonesia", "vietnam",
  "cambodia", "uae", "emirates", "qatar", "japan", "korea", "unitedkingdom", "england", "france",
  "turkey", "australia",
])
const REGION_KEYS = new Set(["kerala", "assam", "kashmir", "ladakh", "andaman", "bali"])

/**
 * How far from the destination's centre an overnight base may be. A named
 * country is big (a trip to Sri Lanka can sleep in Kandy and Galle); a town or
 * district is not (a trip to Coorg must not sleep in Mysore).
 */
export function destinationRadiusKm(text: string): number {
  const found = phrases(text)
  const hits = new Set<string>()
  for (const airport of AIRPORTS) for (const key of airport.keys) if (found.has(key)) hits.add(key)
  if (hits.size === 0) return 90
  const all = (set: Set<string>) => [...hits].every((k) => set.has(k))
  if (all(COUNTRY_KEYS)) return 400
  if ([...hits].every((k) => COUNTRY_KEYS.has(k) || REGION_KEYS.has(k))) return 200
  return 90
}
