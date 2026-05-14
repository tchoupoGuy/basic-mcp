"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetWeatherUseCase = void 0;
class GetWeatherUseCase {
    constructor(repository) {
        this.repository = repository;
    }
    execute(latitude, longitude) {
        return this.repository.getCurrentWeather(latitude, longitude);
    }
    executeByCity(city) {
        return this.repository.getWeatherByCity(city);
    }
}
exports.GetWeatherUseCase = GetWeatherUseCase;
