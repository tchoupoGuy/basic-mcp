import { IWeatherRepository } from "../../domain/ports/IWeatherRepository";
import { WeatherData } from "../../domain/entities/WeatherData";

export class WeatherRepository implements IWeatherRepository {
    async getWeatherByCity(city: string): Promise<WeatherData> {
        const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geoUrl.searchParams.set("name", city);
        geoUrl.searchParams.set("count", "1");
        geoUrl.searchParams.set("language", "fr");
        geoUrl.searchParams.set("format", "json");

        const geoResponse = await fetch(geoUrl.toString());
        if (!geoResponse.ok) {
            throw new Error(`Geocoding API error: ${geoResponse.status} ${geoResponse.statusText}`);
        }

        const geoData = await geoResponse.json() as {
            results?: { latitude: number; longitude: number; name: string; country: string }[];
        };

        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`City not found: "${city}"`);
        }

        const { latitude, longitude, name: city_name, country } = geoData.results[0];
        const weather = await this.getCurrentWeather(latitude, longitude);
        weather.location.city_name = city_name;
        weather.location.country = country;
        return weather;
    }

    async getCurrentWeather(latitude: number, longitude: number): Promise<WeatherData> {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(latitude));
        url.searchParams.set("longitude", String(longitude));
        url.searchParams.set(
            "current",
            "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation",
        );
        url.searchParams.set("timezone", "auto");

        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            latitude: number;
            longitude: number;
            timezone: string;
            current: {
                time: string;
                temperature_2m: number;
                relative_humidity_2m: number;
                apparent_temperature: number;
                weather_code: number;
                wind_speed_10m: number;
                wind_direction_10m: number;
                precipitation: number;
            };
            current_units: Record<string, string>;
        };

        const c = data.current;
        const u = data.current_units;

        return {
            location: { latitude: data.latitude, longitude: data.longitude, timezone: data.timezone },
            time: c.time,
            temperature: `${c.temperature_2m} ${u.temperature_2m}`,
            apparent_temperature: `${c.apparent_temperature} ${u.apparent_temperature}`,
            humidity: `${c.relative_humidity_2m} ${u.relative_humidity_2m}`,
            wind_speed: `${c.wind_speed_10m} ${u.wind_speed_10m}`,
            wind_direction: `${c.wind_direction_10m} ${u.wind_direction_10m}`,
            precipitation: `${c.precipitation} ${u.precipitation}`,
            weather_code: c.weather_code,
        };
    }
}
