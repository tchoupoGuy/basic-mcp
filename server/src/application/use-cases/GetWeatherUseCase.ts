import { IWeatherRepository } from "../../domain/ports/IWeatherRepository";
import { WeatherData } from "../../domain/entities/WeatherData";

export class GetWeatherUseCase {
    constructor(private readonly repository: IWeatherRepository) {}

    execute(latitude: number, longitude: number): Promise<WeatherData> {
        return this.repository.getCurrentWeather(latitude, longitude);
    }
}
