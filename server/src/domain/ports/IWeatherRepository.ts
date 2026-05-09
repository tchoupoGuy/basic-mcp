import { WeatherData } from "../entities/WeatherData";

export interface IWeatherRepository {
    getCurrentWeather(latitude: number, longitude: number): Promise<WeatherData>;
    getWeatherByCity(city: string): Promise<WeatherData>;
}
