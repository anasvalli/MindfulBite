export interface CountryData {
  name: string;
  flag: string;
  cities: string[];
}

export const COUNTRIES_CITIES: CountryData[] = [
  { name: 'Pakistan', flag: '🇵🇰', cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Hyderabad', 'Abbottabad', 'Bahawalpur', 'Sargodha', 'Sukkur'] },
  { name: 'India', flag: '🇮🇳', cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Patna', 'Bhopal', 'Indore', 'Chandigarh', 'Coimbatore'] },
  { name: 'United States', flag: '🇺🇸', cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Denver', 'San Francisco', 'Seattle', 'Atlanta', 'Boston', 'Miami', 'Las Vegas', 'Washington DC'] },
  { name: 'United Kingdom', flag: '🇬🇧', cities: ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Bristol', 'Sheffield', 'Edinburgh', 'Leeds', 'Leicester', 'Newcastle', 'Belfast', 'Cardiff', 'Nottingham', 'Bradford'] },
  { name: 'Canada', flag: '🇨🇦', cities: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Halifax', 'Victoria', 'Saskatoon', 'Regina'] },
  { name: 'Australia', flag: '🇦🇺', cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Newcastle', 'Canberra', 'Sunshine Coast', 'Wollongong', 'Hobart', 'Darwin'] },
  { name: 'Saudi Arabia', flag: '🇸🇦', cities: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Taif', 'Tabuk', 'Buraidah', 'Khamis Mushait', 'Al Khobar', 'Jubail', 'Abha'] },
  { name: 'UAE', flag: '🇦🇪', cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'] },
  { name: 'Bangladesh', flag: '🇧🇩', cities: ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Comilla', 'Mymensingh', 'Narayanganj', 'Gazipur', 'Barishal'] },
  { name: 'Germany', flag: '🇩🇪', cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hanover', 'Nuremberg'] },
  { name: 'France', flag: '🇫🇷', cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Montpellier', 'Strasbourg', 'Bordeaux', 'Lille', 'Rennes', 'Grenoble'] },
  { name: 'Turkey', flag: '🇹🇷', cities: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Adana', 'Gaziantep', 'Konya', 'Antalya', 'Kayseri', 'Mersin', 'Diyarbakır', 'Eskişehir'] },
  { name: 'China', flag: '🇨🇳', cities: ['Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Tianjin', 'Chongqing', 'Wuhan', 'Hangzhou', 'Nanjing', 'Xi\'an', 'Dongguan', 'Foshan'] },
  { name: 'Japan', flag: '🇯🇵', cities: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kyoto', 'Kawasaki', 'Saitama', 'Hiroshima', 'Sendai'] },
  { name: 'South Korea', flag: '🇰🇷', cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan', 'Suwon', 'Changwon', 'Seongnam'] },
  { name: 'Brazil', flag: '🇧🇷', cities: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre', 'Belém'] },
  { name: 'Mexico', flag: '🇲🇽', cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'Cancún', 'Mérida', 'León', 'Querétaro', 'San Luis Potosí'] },
  { name: 'Egypt', flag: '🇪🇬', cities: ['Cairo', 'Alexandria', 'Giza', 'Shubra el Kheima', 'Port Said', 'Suez', 'Luxor', 'Mansoura', 'Asyut', 'Tanta', 'Hurghada', 'Ismailia'] },
  { name: 'Nigeria', flag: '🇳🇬', cities: ['Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Maiduguri', 'Zaria', 'Aba', 'Kaduna', 'Enugu', 'Onitsha'] },
  { name: 'South Africa', flag: '🇿🇦', cities: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'Soweto', 'East London'] },
  { name: 'Indonesia', flag: '🇮🇩', cities: ['Jakarta', 'Surabaya', 'Bandung', 'Bekasi', 'Medan', 'Tangerang', 'Depok', 'Semarang', 'Palembang', 'Makassar', 'Bali'] },
  { name: 'Malaysia', flag: '🇲🇾', cities: ['Kuala Lumpur', 'George Town', 'Ipoh', 'Shah Alam', 'Johor Bahru', 'Kota Kinabalu', 'Kuching', 'Petaling Jaya', 'Subang Jaya', 'Malacca'] },
  { name: 'Philippines', flag: '🇵🇭', cities: ['Manila', 'Davao', 'Cebu', 'Zamboanga', 'Taguig', 'Antipolo', 'Pasig', 'Cagayan de Oro', 'Parañaque', 'Makati', 'Las Piñas'] },
  { name: 'Italy', flag: '🇮🇹', cities: ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania', 'Venice', 'Verona'] },
  { name: 'Spain', flag: '🇪🇸', cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba'] },
  { name: 'Netherlands', flag: '🇳🇱', cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen'] },
  { name: 'Iran', flag: '🇮🇷', cities: ['Tehran', 'Mashhad', 'Isfahan', 'Karaj', 'Tabriz', 'Shiraz', 'Ahvaz', 'Qom', 'Kermanshah', 'Urmia'] },
  { name: 'Iraq', flag: '🇮🇶', cities: ['Baghdad', 'Basra', 'Mosul', 'Erbil', 'Sulaymaniyah', 'Kirkuk', 'Najaf', 'Karbala', 'Nasiriyah'] },
  { name: 'Afghanistan', flag: '🇦🇫', cities: ['Kabul', 'Kandahar', 'Herat', 'Mazar-i-Sharif', 'Jalalabad', 'Kunduz', 'Ghazni', 'Balkh'] },
  { name: 'Russia', flag: '🇷🇺', cities: ['Moscow', 'Saint Petersburg', 'Novosibirsk', 'Yekaterinburg', 'Kazan', 'Nizhny Novgorod', 'Chelyabinsk', 'Samara', 'Ufa', 'Rostov-on-Don'] },
  { name: 'Kenya', flag: '🇰🇪', cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi'] },
  { name: 'Ghana', flag: '🇬🇭', cities: ['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Cape Coast', 'Obuasi'] },
  { name: 'Ethiopia', flag: '🇪🇹', cities: ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Adama', 'Hawassa', 'Bahir Dar'] },
  { name: 'Argentina', flag: '🇦🇷', cities: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'La Plata', 'Tucumán', 'Mar del Plata'] },
  { name: 'Chile', flag: '🇨🇱', cities: ['Santiago', 'Valparaíso', 'Concepción', 'La Serena', 'Antofagasta', 'Temuco', 'Iquique'] },
  { name: 'Colombia', flag: '🇨🇴', cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta', 'Bucaramanga'] },
  { name: 'Peru', flag: '🇵🇪', cities: ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Iquitos', 'Cusco', 'Huancayo'] },
  { name: 'New Zealand', flag: '🇳🇿', cities: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Dunedin', 'Palmerston North'] },
  { name: 'Singapore', flag: '🇸🇬', cities: ['Singapore'] },
  { name: 'Other', flag: '🌍', cities: ['Other'] },
];

export const getCountryNames = (): string[] =>
  COUNTRIES_CITIES.map(c => `${c.flag} ${c.name}`);

export const getCitiesForCountry = (countryDisplay: string): string[] => {
  const name = countryDisplay.replace(/^.{1,4}\s/, ''); // strip emoji
  const found = COUNTRIES_CITIES.find(c => c.name === name);
  return found ? found.cities : ['Other'];
};
