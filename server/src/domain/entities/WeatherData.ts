export interface WeatherData {
    location: { latitude: number; longitude: number; timezone: string; city_name?: string; country?: string };
    time: string;
    temperature: string;
    apparent_temperature: string;
    humidity: string;
    wind_speed: string;
    wind_direction: string;
    precipitation: string;
    weather_code: number;
}
